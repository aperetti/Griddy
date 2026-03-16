"""
Generate realistic 15-minute interval readings for all real CIM nodes.

Writes one parquet file per month to cim_readings/.
~4876 nodes × 96 intervals/day × 30 days ≈ 14 M rows/month.
We generate from Jan 2025 through next month at 15-min resolution.

Phase-aware generation:
- Uses CimModelManager to get accurate per-node phase assignments
- Single-phase nodes (A, B, or C) only produce voltage/current on their phase
- Split-phase nodes (S1/S2) produce voltage_a, voltage_b at ~120 V each
- Three-phase nodes produce all three phases
"""
import duckdb
import json
import os
import sys
import time
from pathlib import Path

SCRIPT_PATH = Path(__file__).resolve()
BACKEND_DIR = SCRIPT_PATH.parents[1]
WORKSPACE_ROOT = SCRIPT_PATH.parents[2]

# Ensure backend/ is importable for CimModelManager
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

DB_PATH = os.getenv("DB_PATH", str(WORKSPACE_ROOT / "grid_data_cim.duckdb"))
PARQUET_DIR = os.getenv("PARQUET_DIR", str(WORKSPACE_ROOT / "cim_readings"))


def _load_topology_into_duckdb(conn):
    """Load topology from CimModelManager into DuckDB temp tables.

    Uses the CIM model's accurate per-node phase assignments derived from
    ACLineSegmentPhase, EnergyConsumerPhase, etc.
    """
    from src.shared.cim_model import CimModelManager

    print("Loading CIM model via CimModelManager...")
    manager = CimModelManager.get_instance()
    manager.load()

    nodes_raw = manager.get_topology_nodes()
    edges_raw = manager.get_topology_edges()

    # Drop tables in correct order to avoid foreign key constraint violations
    conn.execute("DROP TABLE IF EXISTS grid_edges")
    conn.execute("DROP TABLE IF EXISTS grid_nodes")
    conn.execute(
        "CREATE TABLE grid_nodes "
        "(node_id VARCHAR PRIMARY KEY, node_type VARCHAR, phases_present VARCHAR[])"
    )
    parsed = []
    for n in nodes_raw:
        phases = n.get("phases_present", ["A", "B", "C"])
        parsed.append((n["node_id"], n["node_type"], phases))
    conn.executemany("INSERT INTO grid_nodes VALUES (?, ?, ?)", parsed)

    # Edge connectivity for distance calculation
    edge_rows = [(e["from_node_id"], e["to_node_id"]) for e in edges_raw]

    # Substation info for distance calculation
    sub_rows = [
        (n["node_id"], n.get("latitude", 0.0), n.get("longitude", 0.0))
        for n in nodes_raw if n["node_type"] == "Substation"
    ]

    all_node_ids = [(n["node_id"],) for n in nodes_raw]

    # Log phase distribution
    from collections import Counter
    phase_counter = Counter()
    for n in nodes_raw:
        key = ",".join(sorted(n.get("phases_present", ["A", "B", "C"])))
        phase_counter[key] += 1
    print("  Phase distribution in topology:")
    for phases, count in phase_counter.most_common():
        print(f"    {phases:20s} {count}")

    return nodes_raw, edge_rows, sub_rows, all_node_ids

def main():
    print(f"Using analytics DB (DuckDB): {DB_PATH}")
    print(f"Output parquet dir: {PARQUET_DIR}")

    if os.path.exists(PARQUET_DIR):
        print(f"Cleaning existing parquet files in {PARQUET_DIR}...")
        for f in os.listdir(PARQUET_DIR):
            if f.endswith(".parquet"):
                os.remove(os.path.join(PARQUET_DIR, f))
    else:
        os.makedirs(PARQUET_DIR, exist_ok=True)

    print("Loading topology from CIM model into DuckDB analytics engine...")
    with duckdb.connect(DB_PATH) as conn:
        nodes_raw, edge_rows, sub_rows, all_node_ids = _load_topology_into_duckdb(conn)

        n = len(nodes_raw)
        print(f"Found {n} nodes in topology.")
        if n == 0:
            print("ERROR: No nodes found. Run ingest_cim_graph.py first.", file=sys.stderr)
            sys.exit(1)

        # Calculate node distance from closest substation
        print("Calculating node distances from substation...")
        import networkx as nx
        G = nx.Graph()
        G.add_edges_from(edge_rows)

        node_distances = {}
        for sub_id, sub_lat, sub_lon in sub_rows:
            if sub_id in G:
                root_id = sub_id
            else:
                # Find closest node spatially that IS in the graph
                best_dist = float('inf')
                root_id = None
                for nid in list(G.nodes)[:200]:
                    # simple fallback — pick first reachable node
                    root_id = nid
                    break
                if root_id:
                    print(f"Substation disconnected. Using spatial root {root_id} for {sub_id}")
            
            if root_id:
                lengths = nx.single_source_shortest_path_length(G, root_id)
                for node, dist in lengths.items():
                    if node not in node_distances or dist < node_distances[node]:
                        node_distances[node] = dist
                        
        max_dist = max(node_distances.values()) if node_distances else 1
        
        conn.execute("DROP TABLE IF EXISTS node_distances")
        conn.execute("CREATE TABLE node_distances (node_id VARCHAR, distance DOUBLE, distance_pct DOUBLE)")
        dist_rows = [(n_id, float(d), float(d)/max_dist) for n_id, d in node_distances.items()]
        
        # Some isolated nodes might not be in G, give them max_dist
        for node_tuple in all_node_ids:
            n_id = node_tuple[0]
            if n_id not in node_distances:
                dist_rows.append((n_id, float(max_dist), 1.0))

        conn.executemany("INSERT INTO node_distances VALUES (?, ?, ?)", dist_rows)
        print(f"Stored distances for {len(dist_rows)} nodes (max distance = {max_dist}).")

        from datetime import datetime
        now = datetime.now()
        target_end_year = now.year
        target_end_month = now.month + 1 # Reduced from +6 to save CPU/Disk
        if target_end_month > 12:
            target_end_year += (target_end_month - 1) // 12
            target_end_month = (target_end_month - 1) % 12 + 1

        months = []
        curr_year, curr_month = 2025, 1
        while (curr_year < target_end_year) or (curr_year == target_end_year and curr_month <= target_end_month):
            start_dt = f"{curr_year}-{curr_month:02d}-01"
            
            next_month = curr_month + 1
            next_year = curr_year
            if next_month > 12:
                next_month = 1
                next_year += 1
            
            end_dt = f"{next_year}-{next_month:02d}-01"
            months.append((start_dt, end_dt))
            
            curr_year, curr_month = next_year, next_month

        total_start = time.time()

        for idx, (start_dt, end_dt) in enumerate(months, 1):
            month_label = start_dt[:7]
            out_file = f"{PARQUET_DIR}/readings_{month_label.replace('-', '_')}.parquet"

            if os.path.exists(out_file):
                print(f"  -> Month {idx}/12 ({month_label}): already exists, skipping.")
                continue

            print(f"  -> Month {idx}/{len(months)} ({month_label}): generating...")
            chunk_start = time.time()

            # Use range(0, N) intervals from epoch to avoid DuckDB generate_series STRUCT issue
            #
            # Phase-aware generation logic:
            #   - phases_present contains the actual CIM phases: A, B, C, N, S1, S2
            #   - Split-phase (S1/S2): residential 120/240V service via center-tapped
            #     transformer.  We map S1 → voltage_a, S2 → voltage_b, voltage_c = NULL.
            #     Current similarly goes to current_a and current_b.
            #   - Single-phase (A or B or C, possibly with N): only the present phase
            #     gets voltage and current; the others are NULL.
            #   - Three-phase (A,B,C): all three phases get values.
            #
            # The `has_*` flags are computed once in the `nodes` CTE and reused
            # throughout so DuckDB can push the predicate down efficiently.
            query = f"""
                COPY (
                    WITH
                    nodes AS (
                        SELECT
                            n.node_id,
                            n.phases_present,
                            COALESCE(d.distance_pct, 1.0) as distance_pct,
                            -- Standard three-phase flags
                            list_contains(n.phases_present, 'A') AS has_a,
                            list_contains(n.phases_present, 'B') AS has_b,
                            list_contains(n.phases_present, 'C') AS has_c,
                            -- Split-phase flags (map S1→A slot, S2→B slot)
                            list_contains(n.phases_present, 'S1') AS has_s1,
                            list_contains(n.phases_present, 'S2') AS has_s2,
                            -- 10% of residential nodes have PV (simplification)
                            (abs(hash(n.node_id)) % 10 = 3) AND (abs(hash(n.node_id)) % 10 < 6) AS has_pv,
                            -- Count of active power-carrying phases (for current splitting)
                            (CASE WHEN list_contains(n.phases_present, 'A') THEN 1 ELSE 0 END
                           + CASE WHEN list_contains(n.phases_present, 'B') THEN 1 ELSE 0 END
                           + CASE WHEN list_contains(n.phases_present, 'C') THEN 1 ELSE 0 END
                           + CASE WHEN list_contains(n.phases_present, 'S1') THEN 1 ELSE 0 END
                           + CASE WHEN list_contains(n.phases_present, 'S2') THEN 1 ELSE 0 END
                            ) AS phase_count
                        FROM grid_nodes n
                        LEFT JOIN node_distances d ON n.node_id = d.node_id
                    ),
                    time_series AS (
                        SELECT
                            TIMESTAMP '{start_dt}' + (i * INTERVAL '15 minutes') AS ts,
                            MONTH(TIMESTAMP '{start_dt}' + (i * INTERVAL '15 minutes')) AS mnth,
                            DAY(TIMESTAMP '{start_dt}' + (i * INTERVAL '15 minutes')) AS dy,
                            HOUR(TIMESTAMP '{start_dt}' + (i * INTERVAL '15 minutes')) AS hr,
                            DAYOFWEEK(TIMESTAMP '{start_dt}' + (i * INTERVAL '15 minutes')) AS dow
                        FROM range(
                            CAST(0 AS BIGINT),
                            CAST(DATEDIFF('minute', TIMESTAMP '{start_dt}', TIMESTAMP '{end_dt}') / 15 AS BIGINT)
                        ) tbl(i)
                    ),
                    weather_series AS (
                        SELECT t.*, COALESCE(w.temperature, 20.0) as temp
                        FROM time_series t
                        LEFT JOIN weather_recordings w
                          ON t.mnth = w.month AND t.dy = w.day AND t.hr = w.hour
                    ),
                    combined_load AS (
                        SELECT
                            n.node_id,
                            n.has_a, n.has_b, n.has_c,
                            n.has_s1, n.has_s2,
                            n.has_pv,
                            n.phase_count,
                            n.distance_pct,
                            w.ts AS timestamp,
                            CASE
                                WHEN abs(hash(n.node_id)) % 10 IN (6, 7, 8) THEN 'Commercial'
                                WHEN abs(hash(n.node_id)) % 10 = 9 THEN 'Industrial'
                                ELSE 'Residential'
                            END as cust_type,
                            CASE
                                WHEN abs(hash(n.node_id)) % 10 IN (6, 7, 8, 9)
                                    THEN CASE
                                        WHEN w.hr BETWEEN 8 AND 18 THEN 1.0
                                        WHEN w.hr BETWEEN 6 AND 22 THEN 0.6
                                        ELSE 0.2
                                    END
                                ELSE
                                    CASE
                                        WHEN w.hr BETWEEN 6 AND 9 THEN 0.8
                                        WHEN w.hr BETWEEN 17 AND 22 THEN 1.0
                                        WHEN w.hr BETWEEN 9 AND 17 THEN 0.4
                                        ELSE 0.3
                                    END
                            END as base_lf,
                            CASE
                                WHEN w.hr BETWEEN 0 AND 6 THEN 0.4
                                ELSE 1.0
                            END as heat_sensitivity,
                            -- Solar radiance factor: simple cosine bell for daylight hours (approx 7 AM to 7 PM)
                            CASE 
                                WHEN w.hr BETWEEN 7 AND 18 
                                THEN SIN(PI() * (w.hr - 7 + w.ts.minute() / 60.0) / 12.0)
                                ELSE 0.0 
                            END as solar_factor,
                            w.temp
                        FROM nodes n
                        CROSS JOIN weather_series w
                    ),
                    final_load AS (
                        SELECT
                            node_id,
                            has_a, has_b, has_c,
                            has_s1, has_s2,
                            has_pv,
                            phase_count,
                            distance_pct,
                            timestamp,
                            (
                                CASE
                                    WHEN cust_type = 'Commercial' THEN 5.0
                                    WHEN cust_type = 'Industrial' THEN 20.0
                                    ELSE 1.0
                                END
                                * base_lf
                                * (1.0 + (0.15 * heat_sensitivity * GREATEST(0, 18 - temp)) + (0.25 * GREATEST(0, temp - 24)))
                                * (0.7 + 0.6 * random())
                            ) AS lf,
                            solar_factor
                        FROM combined_load
                    ),
                    combined AS (
                        SELECT
                            node_id,
                            timestamp,
                            -- kWh delivered: total consumption load
                            ROUND(0.20 * lf, 6) AS kwh_dlv,
                            -- kWh received: solar generation (if has_pv is true)
                            CASE 
                                WHEN has_pv 
                                THEN ROUND(0.5 * solar_factor * (0.8 + 0.4 * random()), 6)
                                ELSE 0.0 
                            END AS kwh_rcv,

                            -- ── Voltages ──
                            -- Phase A: present if has_a OR split-phase S1 (S1 maps to A slot)
                            CASE WHEN has_a OR has_s1
                                THEN ROUND(
                                    (123.0 + (random() - 0.5) * 2.0)
                                    * (1.0 - LEAST(lf / 8.0, 1.0) * 0.05 - distance_pct * 0.05),
                                3) END AS voltage_a,

                            -- Phase B: present if has_b OR split-phase S2 (S2 maps to B slot)
                            CASE WHEN has_b OR has_s2
                                THEN ROUND(
                                    (123.0 + (random() - 0.5) * 2.0)
                                    * (1.0 - LEAST(lf / 8.0, 1.0) * 0.05 - distance_pct * 0.05),
                                3) END AS voltage_b,

                            -- Phase C: only present if has_c (never for split-phase)
                            CASE WHEN has_c
                                THEN ROUND(
                                    (123.0 + (random() - 0.5) * 2.0)
                                    * (1.0 - LEAST(lf / 8.0, 1.0) * 0.05 - distance_pct * 0.05),
                                3) END AS voltage_c,

                            -- ── Currents ──
                            -- Current is split across present phases.
                            -- For a 3-phase node each phase carries ~1/3 the total load current.
                            -- For a single-phase node, 100% on that one phase.
                            -- For split-phase, 50% on each leg.
                            CASE WHEN has_a OR has_s1
                                THEN ROUND(
                                    (2.0 + lf * 25.0) / GREATEST(phase_count, 1),
                                3) END AS current_a,

                            CASE WHEN has_b OR has_s2
                                THEN ROUND(
                                    (2.0 + lf * 25.0) / GREATEST(phase_count, 1),
                                3) END AS current_b,

                            CASE WHEN has_c
                                THEN ROUND(
                                    (2.0 + lf * 25.0) / GREATEST(phase_count, 1),
                                3) END AS current_c

                        FROM final_load
                    )
                    SELECT * FROM combined
                    ORDER BY node_id, timestamp
                ) TO '{out_file}' (FORMAT PARQUET, CODEC 'ZSTD', ROW_GROUP_SIZE 100000);
            """

            conn.execute(query)
            elapsed = time.time() - chunk_start
            size_mb = os.path.getsize(out_file) / 1_048_576
            print(f"     Done in {elapsed:.1f}s — {size_mb:.1f} MB written to {out_file}")

        total_elapsed = time.time() - total_start
        print(f"\nAll months complete in {total_elapsed:.1f}s")

        # Quick sanity check
        row_count = conn.execute(f"SELECT COUNT(*) FROM read_parquet('{PARQUET_DIR}/*.parquet')").fetchone()[0]
        date_range = conn.execute(f"SELECT MIN(timestamp), MAX(timestamp) FROM read_parquet('{PARQUET_DIR}/*.parquet')").fetchone()
        print(f"Total rows in parquet: {row_count:,}")
        print(f"Date range: {date_range[0]} → {date_range[1]}")

if __name__ == "__main__":
    main()
