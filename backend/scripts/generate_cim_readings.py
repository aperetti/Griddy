import os
import sys
import time
import json
import argparse
import duckdb
import zlib
import numpy as np
import pyarrow as pa
import pyarrow.compute
import pyarrow.parquet as pq
import logging
from pathlib import Path
from datetime import datetime, timedelta

# Ensure backend/ is importable
SCRIPT_PATH = Path(__file__).resolve()
BACKEND_DIR = SCRIPT_PATH.parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Suppress noisy Neo4j notifications and other library logs
logging.getLogger("neo4j").setLevel(logging.ERROR)
logging.getLogger("cimgraph").setLevel(logging.ERROR)

from src.shared.cim_registry import CimModelRegistry
from src.shared.database_setup import DB_PATH, PARQUET_DIR, to_int_id


def _get_equipment_metrics():
    """Fetch topology and compute static metrics keyed by equipment name."""
    print("  Introspecting CIM topology...")
    registry = CimModelRegistry.get_instance()
    registry.load_all()
    nodes_raw, edges_raw = registry.get_combined_topology()
    if not nodes_raw:
        print("ERROR: No topology found.")
        sys.exit(1)

    adj = {}
    for e in edges_raw:
        u, v = e["from_node_id"], e["to_node_id"]
        adj.setdefault(u, []).append(v)
        adj.setdefault(v, []).append(u)

    depths = {}
    queue = []
    substations = [n["node_id"] for n in nodes_raw if n["node_type"] == "Substation"]
    for sub_id in substations:
        depths[sub_id] = 0
        queue.append((sub_id, 0))
    
    idx = 0
    while idx < len(queue):
        u, d = queue[idx]
        idx += 1
        if d >= 40: continue
        for v in adj.get(u, []):
            if v not in depths:
                depths[v] = d + 1
                queue.append((v, d + 1))

    equipment_metrics = {}
    for n in nodes_raw:
        nid = n["node_id"]
        attached = n.get("attached_equipment", [])
        node_phases = n.get("phases") or ["A", "B", "C"]
        depth = depths.get(nid, 20)
        mid = n.get("model_id", "unknown")
        for eq in attached:
            eq_name = eq.get("name")
            if not eq_name: continue
            p_scales = {"A": 0.0, "B": 0.0, "C": 0.0, "S1": 0.0, "S2": 0.0}
            eq_phases = eq.get("phases") or node_phases
            target_phases = [ph for ph in eq_phases if ph in p_scales] or ["A", "B", "C"]
            if eq.get("type") == "EnergyConsumer":
                p_total = float(eq.get("active_power_w", 1200.0))
                for ph in target_phases: p_scales[ph] += p_total / len(target_phases)
            equipment_metrics[eq_name] = {"model_id": mid, "depth": depth, "p_scales": {k: v / 1000.0 for k, v in p_scales.items()}, "phases": eq_phases}
    return equipment_metrics


def generate_month(equipment_metrics, weather_map, start_dt, end_dt, out_file):
    """Generate a globally sorted monthly Parquet file."""
    num_nodes = len(equipment_metrics)
    eq_names = list(equipment_metrics.keys())
    
    timestamps = []
    t = start_dt
    while t < end_dt:
        timestamps.append(t)
        t += timedelta(minutes=15)
    
    num_steps = len(timestamps)
    print(f"    -> Month {start_dt.strftime('%Y-%m')}: {num_nodes * num_steps:,} records...")

    time_floats = np.array([(ts.hour + ts.minute / 60.0) for ts in timestamps])
    load_factors = 0.6 + 0.4 * np.cos(np.pi * (time_floats - 18) / 12.0)
    temps = np.array([weather_map.get((ts.month, ts.day, ts.hour), 20.0) for ts in timestamps])
    weather_multiplier = 1.0 + np.maximum(0, 18 - temps) * 0.03 + np.maximum(0, temps - 24) * 0.05
    base_load_factors = load_factors * weather_multiplier

    all_data = {k: [] for k in ["node_id", "node_id_int", "model_id", "timestamp", "kwh_dlv", "kwh_rcv", "voltage_a", "voltage_b", "voltage_c", "current_a", "current_b", "current_c"]}

    for name in eq_names:
        meta = equipment_metrics[name]
        p = meta["p_scales"]
        phases = meta["phases"]
        is_a, is_b, is_c = ("A" in phases or "S1" in phases), ("B" in phases or "S2" in phases), ("C" in phases)
        kwh_a = (p["A"] + p["S1"]) * base_load_factors * (0.8 + 0.4 * np.random.rand(num_steps)) / 4.0 if is_a else np.zeros(num_steps)
        kwh_b = (p["B"] + p["S2"]) * base_load_factors * (0.8 + 0.4 * np.random.rand(num_steps)) / 4.0 if is_b else np.zeros(num_steps)
        kwh_c = p["C"] * base_load_factors * (0.8 + 0.4 * np.random.rand(num_steps)) / 4.0 if is_c else np.zeros(num_steps)
        v_base = 120.0 * (1.0 - meta["depth"] * 0.001)
        
        # Pre-convert and type appropriately to avoid issues later
        all_data["node_id"].extend([name] * num_steps)
        all_data["node_id_int"].extend([int(to_int_id(name))] * num_steps)
        all_data["model_id"].extend([meta["model_id"]] * num_steps)
        all_data["timestamp"].extend(timestamps)
        all_data["kwh_dlv"].extend((kwh_a + kwh_b + kwh_c).tolist())
        all_data["kwh_rcv"].extend([0.0] * num_steps)
        all_data["voltage_a"].extend((v_base * (0.995 + 0.01 * np.random.rand(num_steps))).tolist() if is_a else [None]*num_steps)
        all_data["voltage_b"].extend((v_base * (0.995 + 0.01 * np.random.rand(num_steps))).tolist() if is_b else [None]*num_steps)
        all_data["voltage_c"].extend((v_base * (0.995 + 0.01 * np.random.rand(num_steps))).tolist() if is_c else [None]*num_steps)
        all_data["current_a"].extend((kwh_a * 4000.0 / 120.0).tolist())
        all_data["current_b"].extend((kwh_b * 4000.0 / 120.0).tolist())
        all_data["current_c"].extend((kwh_c * 4000.0 / 120.0).tolist())

    table = pa.Table.from_pydict(all_data)
    
    # CRITICAL: Global sort of the entire month by node_id_int.
    # This creates perfect Zone Maps for DuckDB skipping.
    indices = pa.compute.sort_indices(table, sort_keys=[("node_id_int", "ascending"), ("timestamp", "ascending")])
    sorted_table = table.take(indices)
    
    pq.write_table(
        sorted_table,
        out_file,
        compression='ZSTD',
        row_group_size=100_000, # Larger row groups are better when data is perfectly sorted
        write_statistics=True,
        write_page_index=True
    )


def main():
    if not os.path.exists(PARQUET_DIR): os.makedirs(PARQUET_DIR, exist_ok=True)
    with duckdb.connect(DB_PATH, read_only=True) as conn:
        w_rows = conn.execute("SELECT month, day, hour, temperature FROM weather_recordings").fetchall()
        weather_map = {(r[0], r[1], r[2]): r[3] for r in w_rows}

    metrics = _get_equipment_metrics()
    
    # Generate from Jan 2025 through next month for full historical coverage.
    # Each month is generated independently so memory stays bounded.
    curr = datetime(2025, 1, 1)
    end = datetime.now() + timedelta(days=32)
    
    while curr < end:
        start_month = curr.replace(day=1)
        next_month = (start_month + timedelta(days=32)).replace(day=1)
        generate_month(metrics, weather_map, start_month, next_month, f"{PARQUET_DIR}/readings_{start_month.strftime('%Y_%m')}.parquet")
        curr = next_month

if __name__ == "__main__":
    main()
