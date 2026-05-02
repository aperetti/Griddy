"""Wall-clock profiler for voltage distribution analysis.

Sister script to ``profile_consumption.py``, focused on the voltage stack:
graph traversal -> storage-key resolution -> three DuckDB sub-queries
(scan / bins / heatmap / stability) -> Python serialization.

Run from the backend/ directory:

    python profile_voltage.py
"""
from __future__ import annotations

import os
import sys
import time
import duckdb

os.environ.setdefault("ami_adapter", "duckdb")

# Reconfigure stdout to UTF-8 with replacement so DuckDB's box-drawing
# characters in EXPLAIN ANALYZE don't crash on Windows cp1252.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

from src.shared.meter_adapters.duckdb_adapter import DuckDBMeterDataRepository
from src.shared.perf import current_phases, reset_phases


PARQUET_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "cim_readings"))
DB_PATH = os.path.join(os.path.dirname(__file__), "grid_data_cim.duckdb")


def _fmt(ms: float) -> str:
    if ms < 1:
        return f"{ms*1000:.0f} µs"
    if ms < 1000:
        return f"{ms:.1f} ms"
    return f"{ms/1000:.2f} s"


def section(title: str) -> None:
    print(f"\n{'='*60}")
    print(f"  {title}")
    print('=' * 60)


def get_real_node_ids(n: int) -> list[str]:
    files = sorted(p for p in os.listdir(PARQUET_DIR) if p.startswith("readings_unified_") and p.endswith(".parquet"))
    if not files:
        sys.exit(f"No parquet files in {PARQUET_DIR}")
    target = os.path.join(PARQUET_DIR, files[-1]).replace("\\", "/")
    conn = duckdb.connect(DB_PATH, read_only=True)
    try:
        rows = conn.execute(
            f"SELECT DISTINCT node_id FROM read_parquet('{target}') LIMIT {n}"
        ).fetchall()
    finally:
        conn.close()
    return [r[0] for r in rows]


def measure(label: str, fn, *args, **kwargs):
    reset_phases()
    t0 = time.perf_counter()
    result = fn(*args, **kwargs)
    wall_ms = (time.perf_counter() - t0) * 1000
    phases = current_phases()
    print(f"\n  {label}")
    print(f"    wall {_fmt(wall_ms)}")
    if phases:
        for name, dur in phases:
            print(f"      - {name:<22} {_fmt(dur):>10}")
    return result


def explain_voltage_subqueries(repo: DuckDBMeterDataRepository, node_ids: list[str], start: str, end: str) -> None:
    """Run EXPLAIN ANALYZE on each of the three voltage sub-queries."""
    section("EXPLAIN ANALYZE — voltage sub-queries (1000 nodes, 7 days)")
    files = repo._get_parquet_range_files(start, end)
    source = f"read_parquet({files})"
    st_lit, et_lit = start.replace("'", "''"), end.replace("'", "''")
    node_table = repo._get_node_table(node_ids)

    with repo._get_connection() as conn:
        conn.register("node_table", node_table)
        tmp = f"tmp_explain_{int(time.time()*1000)}"
        try:
            conn.execute(
                f"CREATE TEMP TABLE {tmp} AS SELECT r.timestamp, r.voltage_a, r.voltage_b, "
                f"r.voltage_c, r.kwh_dlv FROM {source} r INNER JOIN node_table n "
                f"ON r.node_id_int = n.node_id_int WHERE r.timestamp >= '{st_lit}'::TIMESTAMP "
                f"AND r.timestamp <= '{et_lit}'::TIMESTAMP"
            )

            def _explain(label: str, query: str) -> None:
                print(f"\n  --- {label} ---")
                rows = conn.execute(f"EXPLAIN ANALYZE {query}").fetchall()
                for r in rows:
                    print(r[1] if len(r) > 1 else r[0])

            _explain("bins", (
                f"WITH raw AS ("
                f"SELECT ROUND(voltage_a*2)/2.0 as v, 'a' as p FROM {tmp} WHERE voltage_a IS NOT NULL "
                f"UNION ALL SELECT ROUND(voltage_b*2)/2.0, 'b' FROM {tmp} WHERE voltage_b IS NOT NULL "
                f"UNION ALL SELECT ROUND(voltage_c*2)/2.0, 'c' FROM {tmp} WHERE voltage_c IS NOT NULL) "
                f"SELECT v, COUNT(*) FILTER (WHERE p='a'), COUNT(*) FILTER (WHERE p='b'), "
                f"COUNT(*) FILTER (WHERE p='c') FROM raw GROUP BY 1 ORDER BY 1 ASC"
            ))
            _explain("heatmap", (
                f"SELECT * FROM (WITH bucketed AS (SELECT time_bucket(INTERVAL '5 minutes', timestamp) as bucket, "
                f"kwh_dlv, COALESCE(voltage_a, voltage_b, voltage_c) as voltage FROM {tmp}), "
                f"total_loading AS (SELECT bucket, SUM(kwh_dlv) as total_kwh FROM bucketed GROUP BY 1) "
                f"SELECT t.total_kwh, b.voltage, CAST(COUNT(*) AS INTEGER) FROM bucketed b "
                f"JOIN total_loading t ON b.bucket = t.bucket GROUP BY 1, 2) USING SAMPLE reservoir(5000)"
            ))
            _explain("stability", (
                f"SELECT time_bucket(INTERVAL '1 hour', timestamp), "
                f"quantile_cont(COALESCE(voltage_a, voltage_b, voltage_c), 0.1), "
                f"quantile_cont(COALESCE(voltage_a, voltage_b, voltage_c), 0.5), "
                f"quantile_cont(COALESCE(voltage_a, voltage_b, voltage_c), 0.9) "
                f"FROM {tmp} GROUP BY 1 ORDER BY 1 ASC"
            ))
        finally:
            conn.unregister("node_table")
            conn.execute(f"DROP TABLE IF EXISTS {tmp}")


def main() -> int:
    section("Loading real node IDs from parquet")
    node_ids = get_real_node_ids(4000)
    print(f"  Loaded {len(node_ids):,} distinct node IDs")

    repo = DuckDBMeterDataRepository(DB_PATH, PARQUET_DIR)
    # Warm parquet file list cache.
    repo._get_parquet_range_files("2026-04-01T00:00:00", "2026-04-30T23:59:59")

    section("Wall-clock breakdown — voltage sub-phases")

    measure(
        "[A] 200 nodes, 7 days (warmup)",
        repo.get_voltage_distribution, node_ids[:200],
        "2026-04-01T00:00:00", "2026-04-07T23:59:59",
    )
    measure(
        "[B] 200 nodes, 7 days (warm cache)",
        repo.get_voltage_distribution, node_ids[:200],
        "2026-04-01T00:00:00", "2026-04-07T23:59:59",
    )
    measure(
        "[C] 1000 nodes, 30 days",
        repo.get_voltage_distribution, node_ids[:1000],
        "2026-04-01T00:00:00", "2026-04-30T23:59:59",
    )
    measure(
        "[D] 4000 nodes, 30 days",
        repo.get_voltage_distribution, node_ids,
        "2026-04-01T00:00:00", "2026-04-30T23:59:59",
    )

    explain_voltage_subqueries(
        repo, node_ids[:1000],
        "2026-04-01T00:00:00", "2026-04-07T23:59:59",
    )

    print("\n" + "=" * 60)
    print("  Profiling complete.")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
