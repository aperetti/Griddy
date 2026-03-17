"""Synthetic reading generation for CIM models in DuckDB."""

import os
import sys
import time
import argparse
from pathlib import Path

SCRIPT_PATH = Path(__file__).resolve()
BACKEND_DIR = SCRIPT_PATH.parents[1]
WORKSPACE_ROOT = BACKEND_DIR.parent

# Ensure backend/ is importable
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import duckdb
import numpy as np
from src.shared.cim import CimModelManager
from src.shared.database_setup import SQLITE_PATH, DB_PATH, PARQUET_DIR

def _load_topology_into_duckdb(conn):
    """Load metadata from analytics DB to guide generation."""
    print("  Fetching node metadata...")
    conn.execute("INSTALL sqlite")
    conn.execute("LOAD sqlite")
    # Use as_posix() for Windows path compatibility in SQL
    sqlite_posix = Path(SQLITE_PATH).as_posix()
    conn.execute(f"ATTACH '{sqlite_posix}' AS topology (TYPE SQLITE)")
    
    nodes_raw = conn.execute("SELECT node_id, model_id, phases_present FROM topology.grid_nodes").fetchall()
    
    print("  Fetching connectivity...")
    edge_rows = conn.execute("SELECT from_node_id, to_node_id, model_id FROM topology.grid_edges").fetchall()
    
    print("  Fetching substations...")
    sub_rows = conn.execute("SELECT node_id, model_id, latitude, longitude FROM topology.grid_nodes WHERE node_type='Substation'").fetchall()
    
    all_node_ids = conn.execute("SELECT node_id FROM topology.grid_nodes").fetchall()

    import json
    from collections import Counter
    phase_counter = Counter([tuple(json.loads(r[2])) if r[2] else () for r in nodes_raw])
    print(f"  Topology Summary: {len(nodes_raw)} nodes")
    print("  Phase distribution:")
    for phases, count in phase_counter.most_common():
        phases_str = str(phases)
        print(f"    {phases_str:20s} {count}")

    return nodes_raw, edge_rows, sub_rows, all_node_ids

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-clean", action="store_true", help="Do not clean existing parquet files")
    args = parser.parse_args()

    print(f"Using analytics DB (DuckDB): {DB_PATH}")
    print(f"Output parquet dir: {PARQUET_DIR}")

    if os.path.exists(PARQUET_DIR):
        if not args.no_clean:
            print(f"Cleaning existing parquet files in {PARQUET_DIR}...")
            for f in os.listdir(PARQUET_DIR):
                if f.endswith(".parquet"):
                    os.remove(os.path.join(PARQUET_DIR, f))
    else:
        os.makedirs(PARQUET_DIR, exist_ok=True)

    print("Loading topology from CIM model into DuckDB analytics engine...")
    with duckdb.connect(DB_PATH) as conn:
        # ── DuckDB Resource Management ────────────────────────────────────
        conn.execute("SET memory_limit = '3GB'")
        conn.execute("SET threads = 4")
        temp_dir = WORKSPACE_ROOT / "tmp_duckdb"
        os.makedirs(temp_dir, exist_ok=True)
        conn.execute(f"SET temp_directory = '{temp_dir}'")

        nodes_raw, edge_rows, sub_rows, all_node_ids = _load_topology_into_duckdb(conn)

        n = len(nodes_raw)
        if n == 0:
            print("ERROR: No nodes found. Run ingest_cim_graph.py first.", file=sys.stderr)
            sys.exit(1)

        print("Generating readings for whole grid topology simultaneously...")

        # 1. BFS in Python for shortest path distance
        print("  Calculating connectivity distances using BFS in Python...")
        dist_start = time.time()
        
        # Build adjacency list
        adj = {}
        for row in edge_rows:
            u, v, _ = row
            adj.setdefault(u, []).append(v)
            adj.setdefault(v, []).append(u)
            
        # BFS from all substations simultaneously
        distances = {}
        queue = []
        for row in sub_rows:
            sub_id = row[0]
            distances[sub_id] = 0.0
            queue.append((sub_id, 0.0))
            
        idx = 0
        while idx < len(queue):
            u, d = queue[idx]
            idx += 1
            if d >= 25:
                continue
            for v in adj.get(u, []):
                if v not in distances:
                    distances[v] = d + 1.0
                    queue.append((v, d + 1.0))
                    
        # Prep for DuckDB upload
        dist_data = [[node_id, d / 25.0] for node_id, d in distances.items()]
        
        conn.execute("CREATE TABLE node_distances_tmp (node_id TEXT, distance_pct DOUBLE)")
        if dist_data:
            conn.executemany("INSERT INTO node_distances_tmp VALUES (?, ?)", dist_data)
            
        conn.execute("DROP TABLE IF EXISTS node_distances")
        conn.execute("ALTER TABLE node_distances_tmp RENAME TO node_distances")
        
        dist_elapsed = time.time() - dist_start
        print(f"  Distances calculated for {len(dist_data)} nodes in {dist_elapsed:.1f}s.")

        from datetime import datetime
        now = datetime.now()
        # End of current month
        target_end_year, target_end_month = now.year, now.month + 1
        if target_end_month > 12:
            target_end_year += 1
            target_end_month = 1

        months = []
        curr_year, curr_month = 2025, 1
        while (curr_year < target_end_year) or (curr_year == target_end_year and curr_month <= target_end_month):
            start_dt = f"{curr_year}-{curr_month:02d}-01"
            next_m = curr_month + 1
            next_y = curr_year
            if next_m > 12:
                next_m, next_y = 1, curr_year + 1
            end_dt = f"{next_y}-{next_m:02d}-01"
            months.append((start_dt, end_dt))
            curr_year, curr_month = next_y, next_m

        total_start = time.time()
        for idx, (start_dt, end_dt) in enumerate(months, 1):
            month_label = start_dt[:7].replace('-', '_')
            out_file = f"{PARQUET_DIR}/readings_unified_{month_label}.parquet"

            if os.path.exists(out_file):
                print(f"  -> Month {idx}/{len(months)}: already exists.")
                continue

            print(f"  -> Month {idx}/{len(months)} ({start_dt[:7]}): generating all models simultaneously...")
            chunk_start = time.time()
            query = f"""
                COPY (
                    WITH
                    nodes AS (
                        SELECT
                            n.node_id,
                            n.model_id,
                            n.phases_present,
                            COALESCE(d.distance_pct, 1.0) as distance_pct,
                            n.phases_present LIKE '%"A"%' AS has_a,
                            n.phases_present LIKE '%"B"%' AS has_b,
                            n.phases_present LIKE '%"C"%' AS has_c,
                            n.phases_present LIKE '%"S1"%' AS has_s1,
                            n.phases_present LIKE '%"S2"%' AS has_s2,
                            (abs(hash(n.node_id)) % 10 = 3) AND (abs(hash(n.node_id)) % 10 < 6) AS has_pv,
                            (CASE WHEN n.phases_present LIKE '%"A"%' THEN 1 ELSE 0 END
                           + CASE WHEN n.phases_present LIKE '%"B"%' THEN 1 ELSE 0 END
                           + CASE WHEN n.phases_present LIKE '%"C"%' THEN 1 ELSE 0 END
                           + CASE WHEN n.phases_present LIKE '%"S1"%' THEN 1 ELSE 0 END
                           + CASE WHEN n.phases_present LIKE '%"S2"%' THEN 1 ELSE 0 END
                            ) AS phase_count
                        FROM topology.grid_nodes n
                        LEFT JOIN node_distances d ON n.node_id = d.node_id
                    ),
                    time_series AS (
                        SELECT
                            TIMESTAMP '{start_dt}' + (i * INTERVAL '15 minutes') AS ts,
                            MONTH(TIMESTAMP '{start_dt}' + (i * INTERVAL '15 minutes')) AS mnth,
                            DAY(TIMESTAMP '{start_dt}' + (i * INTERVAL '15 minutes')) AS dy,
                            HOUR(TIMESTAMP '{start_dt}' + (i * INTERVAL '15 minutes')) AS hr,
                            DAYOFWEEK(TIMESTAMP '{start_dt}' + (i * INTERVAL '15 minutes')) AS dow
                        FROM range(0, CAST(DATEDIFF('minute', TIMESTAMP '{start_dt}', TIMESTAMP '{end_dt}') / 15 AS BIGINT)) tbl(i)
                    ),
                    weather_series AS (
                        SELECT t.*, COALESCE(w.temperature, 20.0) as temp
                        FROM time_series t
                        LEFT JOIN weather_recordings w ON t.mnth = w.month AND t.dy = w.day AND t.hr = w.hour
                    ),
                    combined_load AS (
                        SELECT
                            n.node_id, n.model_id, n.has_a, n.has_b, n.has_c, n.has_s1, n.has_s2, n.has_pv, n.phase_count, n.distance_pct,
                            w.ts AS timestamp,
                            CASE WHEN abs(hash(n.node_id)) % 10 IN (6,7,8) THEN 'Commercial' WHEN abs(hash(n.node_id)) % 10 = 9 THEN 'Industrial' ELSE 'Residential' END as cust_type,
                            CASE WHEN abs(hash(n.node_id)) % 10 IN (6,7,8,9) THEN (CASE WHEN w.hr BETWEEN 8 AND 18 THEN 1.0 WHEN w.hr BETWEEN 6 AND 22 THEN 0.6 ELSE 0.2 END)
                            ELSE (CASE WHEN w.hr BETWEEN 6 AND 9 THEN 0.8 WHEN w.hr BETWEEN 17 AND 22 THEN 1.0 WHEN w.hr BETWEEN 9 AND 17 THEN 0.4 ELSE 0.3 END) END as base_lf,
                            CASE WHEN w.hr BETWEEN 0 AND 6 THEN 0.4 ELSE 1.0 END as heat_sensitivity,
                            CASE WHEN w.hr BETWEEN 7 AND 18 THEN SIN(PI() * (w.hr - 7 + w.ts.minute() / 60.0) / 12.0) ELSE 0.0 END as solar_factor,
                            w.temp
                        FROM nodes n CROSS JOIN weather_series w
                    ),
                    final_load AS (
                        SELECT node_id, model_id, has_a, has_b, has_c, has_s1, has_s2, has_pv, phase_count, distance_pct, timestamp,
                            ((CASE WHEN cust_type = 'Commercial' THEN 5.0 WHEN cust_type = 'Industrial' THEN 20.0 ELSE 1.0 END) * base_lf * (1.0 + (0.15 * heat_sensitivity * GREATEST(0, 18 - temp)) + (0.25 * GREATEST(0, temp - 24))) * (0.7 + 0.6 * random())) AS lf,
                            solar_factor
                        FROM combined_load
                    ),
                    combined AS (
                        SELECT node_id, model_id, timestamp,
                            ROUND(0.20 * lf, 6) AS kwh_dlv,
                            CASE WHEN has_pv THEN ROUND(0.5 * solar_factor * (0.8 + 0.4 * random()), 6) ELSE 0.0 END AS kwh_rcv,
                            CASE WHEN has_a OR has_s1 THEN ROUND((123.0 + (random()-0.5)*2.0) * (1.0 - LEAST(lf/8.0, 1.0)*0.05 - distance_pct*0.05), 3) END AS voltage_a,
                            CASE WHEN has_b OR has_s2 THEN ROUND((123.0 + (random()-0.5)*2.0) * (1.0 - LEAST(lf/8.0, 1.0)*0.05 - distance_pct*0.05), 3) END AS voltage_b,
                            CASE WHEN has_c THEN ROUND((123.0 + (random()-0.5)*2.0) * (1.0 - LEAST(lf/8.0, 1.0)*0.05 - distance_pct*0.05), 3) END AS voltage_c,
                            CASE WHEN has_a OR has_s1 THEN ROUND((2.0 + lf * 25.0) / GREATEST(phase_count, 1), 3) END AS current_a,
                            CASE WHEN has_b OR has_s2 THEN ROUND((2.0 + lf * 25.0) / GREATEST(phase_count, 1), 3) END AS current_b,
                            CASE WHEN has_c THEN ROUND((2.0 + lf * 25.0) / GREATEST(phase_count, 1), 3) END AS current_c
                        FROM final_load
                    )
                    SELECT * FROM combined
                ) TO '{out_file}' (FORMAT PARQUET, CODEC 'ZSTD');
            """
            conn.execute(query)
            elapsed = time.time() - chunk_start
            print(f"     Done in {elapsed:.1f}s — {out_file}")

        total_elapsed = time.time() - total_start
        print(f"\nBulk generation complete in {total_elapsed:.1f}s")

if __name__ == "__main__":
    main()
