"""
Profile the consumption analysis stack end-to-end with realistic data.

Run from the backend/ directory:
    python profile_consumption.py
"""
import cProfile
import pstats
import io
import time
import os
import sys
import duckdb
from collections import defaultdict

# ── Pre-import everything so import time doesn't pollute profiles ─────────────
os.environ.setdefault("CIMG_URL", "")          # suppress Neo4j connection attempt
os.environ.setdefault("ami_adapter", "duckdb")

# Now import the stack
from src.grid.topology_engine import TopologyEngine
from src.grid.graph_node import GraphNode
from src.analytics.calculate_consumption import CalculateAggregateConsumptionUseCase
from src.shared.meter_adapters.duckdb_adapter import DuckDBMeterDataRepository
import src.shared.dependencies as deps

# ── Paths ─────────────────────────────────────────────────────────────────────
PARQUET_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "cim_readings"))
DB_PATH     = os.path.join(os.path.dirname(__file__), "grid_data_cim.duckdb")

# ── Utilities ─────────────────────────────────────────────────────────────────

def _fmt(ms: float) -> str:
    if ms < 1:      return f"{ms*1000:.0f} µs"
    if ms < 1000:   return f"{ms:.1f} ms"
    return f"{ms/1000:.2f} s"

def section(title: str):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print('='*60)

def profile_block(label: str, fn, *args, **kwargs):
    pr = cProfile.Profile()
    pr.enable()
    result = fn(*args, **kwargs)
    pr.disable()
    buf = io.StringIO()
    pstats.Stats(pr, stream=buf).sort_stats("tottime").print_stats(15)
    lines = buf.getvalue().splitlines()
    print(f"\n--- cProfile (sort: tottime): {label} ---")
    for line in lines[4:]:
        if line.strip():
            print(line)
    return result

# ── 1. Synthetic radial feeder ────────────────────────────────────────────────

def build_synthetic_feeder(n_nodes: int = 4519):
    nodes: list[GraphNode] = []
    edges: list[dict] = []
    src_id = "SUBSTATION"
    nodes.append(GraphNode(
        id=src_id, type="Bus", name="Substation", base_voltage_kv=12.47,
        attached_equipment=[{"type": "EnergySource", "name": "grid"}],
        phases=["A", "B", "C"],
    ))
    queue = [src_id]
    eid = 0
    phase_cycle = [["A"], ["B"], ["C"], ["A", "B", "C"]]
    while len(nodes) < n_nodes and queue:
        parent = queue.pop(0)
        for _ in range(3):
            if len(nodes) >= n_nodes: break
            child_id = f"node_{len(nodes)}"
            phase = phase_cycle[len(nodes) % len(phase_cycle)]
            nodes.append(GraphNode(
                id=child_id, type="Bus", name=child_id,
                base_voltage_kv=4.16, phases=phase, attached_equipment=[],
            ))
            edges.append({"edge_id": f"e{eid}", "from_node_id": parent,
                          "to_node_id": child_id, "phases": phase})
            eid += 1
            queue.append(child_id)
    eng = TopologyEngine()
    eng.build_graph(nodes=nodes, edges=edges)
    return eng, src_id

# ── 2. DuckDB repo with graceful weather handling ─────────────────────────────

class _NullWeatherRepo(DuckDBMeterDataRepository):
    """Subclass that skips the weather table when it doesn't exist locally."""
    def _get_weather_map(self, conn):
        if self._weather_map is None:
            try:
                rows = conn.execute(
                    "SELECT month, day, hour, temperature FROM weather_recordings"
                ).fetchall()
                self._weather_map = {(r[0], r[1], r[2]): r[3] for r in rows}
            except Exception:
                self._weather_map = {}   # no weather table locally — skip
        return self._weather_map

def make_repo():
    return _NullWeatherRepo(DB_PATH, PARQUET_DIR)

# ── 3. Null meter repo for topology-only profiling ────────────────────────────

class _NullRepo:
    def get_aggregate_consumption(self, *a, **kw): return []
    def estimate_aggregate_consumption(self, *a, **kw): return {"estimated_rows": 0}

def run_phase_propagation(engine, start_node_ids: list[str]):
    """Profile only the BFS + phase propagation; DuckDB query is skipped."""
    orig_names, orig_mrids, orig_eq = (
        deps._node_to_equipment_names,
        deps._node_to_equipment_mrids,
        deps._equipment_to_node,
    )
    try:
        deps._node_to_equipment_names = defaultdict(list)
        deps._node_to_equipment_mrids = defaultdict(list)
        deps._equipment_to_node = {}
        uc = CalculateAggregateConsumptionUseCase(engine, _NullRepo())
        uc.execute(start_node_ids, "2026-04-01T00:00:00", "2026-04-30T23:59:59")
    finally:
        deps._node_to_equipment_names = orig_names
        deps._node_to_equipment_mrids = orig_mrids
        deps._equipment_to_node = orig_eq

# ── 4. Load real node IDs ─────────────────────────────────────────────────────

def get_real_node_ids(n: int = 4519) -> list[str]:
    conn = duckdb.connect(DB_PATH, read_only=True)
    rows = conn.execute(
        f"SELECT DISTINCT node_id FROM read_parquet('{PARQUET_DIR.replace(chr(92), '/')}"
        f"/readings_unified_2026_04.parquet') LIMIT {n}"
    ).fetchall()
    conn.close()
    return [r[0] for r in rows]

# ── 5. Wall-clock per-phase breakdown ─────────────────────────────────────────

def wall_clock_breakdown(engine, src_id: str, real_node_ids: list[str]):
    section("Wall-clock breakdown — phase by phase")

    def _lap(label, fn, *a, **kw):
        t0 = time.perf_counter()
        r = fn(*a, **kw)
        ms = (time.perf_counter() - t0) * 1000
        print(f"  {label:<55} {_fmt(ms):>12}")
        return r

    print()

    # A — BFS cold
    engine._bfs_cache.clear()
    all_nodes, all_edges = set(), set()
    def bfs_cold():
        n, e = engine.find_downstream(src_id)
        all_nodes.update(n); all_edges.update(e)
    _lap(f"[A ] BFS find_downstream cold (4,519-node feeder)", bfs_cold)
    print(f"       -> {len(all_nodes):,} downstream nodes, {len(all_edges):,} edges")

    # A2 — BFS warm (cached)
    _lap(f"[A2] BFS find_downstream warm (cache hit)", engine.find_downstream, src_id)

    # B — get_edges + build adjacency
    raw_edges_holder = [None]
    adj_holder = [None]
    def build_adj():
        raw = engine.get_edges(list(all_edges))
        raw_edges_holder[0] = raw
        adj = {}
        for e in raw:
            fid = e.get("from_node_id")
            if fid: adj.setdefault(fid, []).append((e.get("to_node_id"), e))
        adj_holder[0] = adj
    _lap(f"[B ] get_edges + adjacency dict ({len(all_edges):,} edges)", build_adj)

    # C — get_nodes
    node_objs_holder = [None]
    def get_nodes():
        node_objs_holder[0] = engine.get_nodes(list(all_nodes))
    _lap(f"[C ] get_nodes ({len(all_nodes):,} nodes)", get_nodes)

    # D — phase propagation loop
    def get_primaries(phases):
        if not phases: return []
        return [p for p in phases if p in ("A", "B", "C")]
    node_map = {n.id: n for n in node_objs_holder[0]}
    selection_adj = adj_holder[0]

    def propagate():
        profiles: dict = {}
        queue = [src_id]
        n = node_map.get(src_id)
        node_p = get_primaries(n.phases) if n else ["A","B","C"]
        share = 1.0 / len(node_p)
        profiles[src_id] = {p: (share if p in node_p else 0.0) for p in ["A","B","C"]}
        visited = {src_id}
        idx = 0
        while idx < len(queue):
            u_id = queue[idx]; idx += 1
            u_profile = profiles[u_id]
            for v_id, edge in selection_adj.get(u_id, []):
                if v_id in visited: continue
                v_node = node_map.get(v_id)
                if not v_node: continue
                v_p = get_primaries(v_node.phases)
                if not v_p:
                    edge_p = get_primaries(edge.get("phases", []))
                    profiles[v_id] = (
                        {p: (1.0/len(edge_p) if p in edge_p else 0.0) for p in ["A","B","C"]}
                        if edge_p else u_profile
                    )
                else:
                    s = 1.0 / len(v_p)
                    profiles[v_id] = {p: (s if p in v_p else 0.0) for p in ["A","B","C"]}
                visited.add(v_id); queue.append(v_id)
    _lap(f"[D ] Phase propagation loop ({len(all_nodes):,} nodes, {len(all_edges):,} edges)", propagate)

    # E — Bucket building for 4,519 real node IDs
    def build_buckets():
        ba, bb, bc, babc = [], [], [], []
        for nid in real_node_ids:
            w = {"A": 1/3, "B": 1/3, "C": 1/3}
            wa, wb, wc = w.get("A",0), w.get("B",0), w.get("C",0)
            nl = nid.lower()
            if wa > 0.9: ba.append(nl)
            elif wb > 0.9: bb.append(nl)
            elif wc > 0.9: bc.append(nl)
            else: babc.append(nl)
    _lap(f"[E ] Bucket build ({len(real_node_ids):,} node IDs)", build_buckets)

    # F — Parquet file scan (cache warm)
    repo = make_repo()
    repo._get_parquet_range_files("2026-04-01T00:00:00", "2026-04-30T23:59:59")   # warm list cache
    weights_200 = {nid: {"A":1/3,"B":1/3,"C":1/3} for nid in real_node_ids[:200]}
    weights_all = {nid: {"A":1/3,"B":1/3,"C":1/3} for nid in real_node_ids}

    result_f = _lap(f"[F ] DuckDB (200 nodes, full April 2026)",
                    repo.get_aggregate_consumption, real_node_ids[:200], weights_200,
                    "2026-04-01T00:00:00", "2026-04-30T23:59:59")
    print(f"       -> {len(result_f):,} time-points returned")

    result_f2 = _lap(f"[F2] DuckDB (200 nodes, 1 week)",
                     repo.get_aggregate_consumption, real_node_ids[:200], weights_200,
                     "2026-04-01T00:00:00", "2026-04-07T23:59:59")
    print(f"       -> {len(result_f2):,} time-points returned")

    result_f3 = _lap(f"[F3] DuckDB (200 nodes, repeat — weather cached)",
                     repo.get_aggregate_consumption, real_node_ids[:200], weights_200,
                     "2026-04-01T00:00:00", "2026-04-30T23:59:59")
    print(f"       -> {len(result_f3):,} time-points returned")

    print(f"\n  [G ] DuckDB (ALL {len(real_node_ids):,} nodes, full April) — stand by...")
    result_g = _lap(f"[G ] DuckDB ({len(real_node_ids):,} nodes, full April)",
                    repo.get_aggregate_consumption, real_node_ids, weights_all,
                    "2026-04-01T00:00:00", "2026-04-30T23:59:59")
    print(f"       -> {len(result_g):,} time-points returned")

# ── 6. DuckDB internals breakdown ─────────────────────────────────────────────

def duckdb_internals(real_node_ids: list[str]):
    section("DuckDB internals — query vs Python overhead (200 nodes)")
    repo = make_repo()
    ids = real_node_ids[:200]
    ids_low = [n.lower() for n in ids]

    # Parquet file list
    t0 = time.perf_counter()
    files = repo._get_parquet_range_files("2026-04-01T00:00:00", "2026-04-30T23:59:59")
    print(f"  Parquet file list ({len(files)} files):        {_fmt((time.perf_counter()-t0)*1000)}")

    source_sql = repo._get_read_parquet_sql(files)

    # Raw DuckDB execute only (no Python post-processing)
    conn = duckdb.connect(DB_PATH, read_only=True)
    query = f"""
        SELECT
            timestamp,
            SUM(COALESCE(kwh_dlv, 0)),
            SUM(COALESCE(kwh_rcv, 0)),
            SUM(CASE WHEN node_id = ANY(?::VARCHAR[]) THEN COALESCE(kwh_dlv, 0) / 3.0 ELSE 0 END),
            SUM(CASE WHEN node_id = ANY(?::VARCHAR[]) THEN COALESCE(kwh_dlv, 0) / 3.0 ELSE 0 END),
            SUM(CASE WHEN node_id = ANY(?::VARCHAR[]) THEN COALESCE(kwh_dlv, 0) / 3.0 ELSE 0 END)
        FROM {source_sql}
        WHERE node_id = ANY(?::VARCHAR[])
          AND timestamp >= CAST('2026-04-01T00:00:00' AS TIMESTAMP)
          AND timestamp <= CAST('2026-04-30T23:59:59' AS TIMESTAMP)
        GROUP BY timestamp ORDER BY timestamp ASC
    """
    params = [ids_low, ids_low, ids_low, ids_low]

    t0 = time.perf_counter()
    rows = conn.execute(query, params).fetchall()
    duckdb_ms = (time.perf_counter() - t0) * 1000
    print(f"  DuckDB execute+fetchall ({len(rows):,} rows):    {_fmt(duckdb_ms)}")

    # Python post-processing
    from datetime import datetime
    t0 = time.perf_counter()
    output = []
    for row in rows:
        ts = row[0]
        dt = ts if isinstance(ts, datetime) else datetime.fromisoformat(ts.isoformat())
        output.append({"timestamp": dt.isoformat()+"Z", "kwh_delivered": float(row[1]),
                       "kwh_received": float(row[2]), "kwh_a": float(row[3]),
                       "kwh_b": float(row[4]), "kwh_c": float(row[5]), "temperature": None})
    py_ms = (time.perf_counter() - t0) * 1000
    print(f"  Python row post-processing ({len(output):,} rows):  {_fmt(py_ms)}")

    # Test COUNT(*) scan cost alone
    t0 = time.perf_counter()
    count_rows = conn.execute(
        f"SELECT COUNT(*) FROM {source_sql} WHERE node_id = ANY(?::VARCHAR[])"
        f" AND timestamp >= CAST('2026-04-01T00:00:00' AS TIMESTAMP)"
        f" AND timestamp <= CAST('2026-04-30T23:59:59' AS TIMESTAMP)",
        [ids_low]
    ).fetchone()
    scan_ms = (time.perf_counter() - t0) * 1000
    print(f"  COUNT(*) scan only ({count_rows[0]:,} matching rows): {_fmt(scan_ms)}")

    # Cost of reading ALL 13M rows for this month (no node filter)
    t0 = time.perf_counter()
    conn.execute(
        f"SELECT COUNT(*) FROM {source_sql}"
        f" WHERE timestamp >= CAST('2026-04-01T00:00:00' AS TIMESTAMP)"
        f" AND timestamp <= CAST('2026-04-30T23:59:59' AS TIMESTAMP)"
    ).fetchone()
    full_scan_ms = (time.perf_counter() - t0) * 1000
    print(f"  Full scan (no node filter, ~13M rows):      {_fmt(full_scan_ms)}")

    conn.close()

    # EXPLAIN ANALYZE
    print("\n  --- EXPLAIN ANALYZE (200 nodes, full April) ---")
    conn2 = duckdb.connect(DB_PATH, read_only=True)
    explain_rows = conn2.execute(
        f"EXPLAIN ANALYZE {query}", params
    ).fetchall()
    for r in explain_rows:
        print(r[1])
    conn2.close()


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    section("Building synthetic feeder (4,519 nodes)")
    t0 = time.perf_counter()
    engine, src_id = build_synthetic_feeder(4519)
    print(f"  Graph built in {_fmt((time.perf_counter()-t0)*1000)}")

    section("Loading real node IDs from parquet")
    real_node_ids = get_real_node_ids(4519)
    print(f"  Loaded {len(real_node_ids):,} distinct node IDs from April 2026")

    # ── cProfile: BFS cold ────────────────────────────────────────────────────
    section("cProfile — BFS find_downstream (cold, 4,519-node feeder)")
    engine._bfs_cache.clear()
    profile_block("find_downstream cold", engine.find_downstream, src_id)

    # ── cProfile: BFS warm (cache hit) ───────────────────────────────────────
    section("cProfile — BFS find_downstream (warm cache)")
    profile_block("find_downstream warm", engine.find_downstream, src_id)

    # ── cProfile: phase propagation only ─────────────────────────────────────
    section("cProfile — phase propagation (4,519-node feeder, cache warm)")
    engine._bfs_cache.clear()
    engine.find_downstream(src_id)  # warm cache first so BFS doesn't pollute
    profile_block("phase propagation", run_phase_propagation, engine, [src_id])

    # ── cProfile: DuckDB 200 nodes ────────────────────────────────────────────
    section("cProfile — DuckDB query (200 nodes, full April)")
    def _duckdb_200():
        repo = make_repo()
        ids = real_node_ids[:200]
        return repo.get_aggregate_consumption(
            ids, {n: {"A":1/3,"B":1/3,"C":1/3} for n in ids},
            "2026-04-01T00:00:00", "2026-04-30T23:59:59"
        )
    profile_block("duckdb 200 nodes", _duckdb_200)

    # ── Wall-clock breakdown ──────────────────────────────────────────────────
    wall_clock_breakdown(engine, src_id, real_node_ids)

    # ── DuckDB internals ──────────────────────────────────────────────────────
    duckdb_internals(real_node_ids)

    print("\n" + "="*60)
    print("  Profiling complete.")
    print("="*60)


if __name__ == "__main__":
    sys.exit(main())
