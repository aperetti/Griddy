"""Synthetic reading generation for CIM models via Python Memory + Parquet/DuckDB."""

import os
import sys
import time
import json
import argparse
import duckdb
import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
from pathlib import Path
from datetime import datetime, timedelta

SCRIPT_PATH = Path(__file__).resolve()
BACKEND_DIR = SCRIPT_PATH.parents[1]
WORKSPACE_ROOT = BACKEND_DIR.parent

# Ensure backend/ is importable
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from src.shared.cim_registry import CimModelRegistry
from src.shared.database_setup import DB_PATH, PARQUET_DIR


def _get_equipment_metrics():
    """Fetch topology and compute static metrics keyed by equipment name."""
    print("  Introspecting CIM topology for physics-based generation...")
    registry = CimModelRegistry.get_instance()
    registry.load_all()
    
    nodes_raw, edges_raw = registry.get_combined_topology()
    if not nodes_raw:
        print("ERROR: No topology found. Ensure models are ingested first.")
        sys.exit(1)

    # 1. Adjacency for depth BFS
    adj = {}
    for e in edges_raw:
        u, v = e["from_node_id"], e["to_node_id"]
        adj.setdefault(u, []).append(v)
        adj.setdefault(v, []).append(u)

    # 2. BFS for depth
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

    # 3. Process every piece of conducting equipment
    equipment_metrics = {}
    for n in nodes_raw:
        nid = n["node_id"]
        attached = n.get("attached_equipment", [])
        node_phases = n.get("phases") or ["A", "B", "C"]
        depth = depths.get(nid, 20)
        mid = n.get("model_id", "unknown")
        
        for eq in attached:
            eq_type = eq.get("type")
            eq_name = eq.get("name")
            if not eq_name: continue
            
            p_scales = {"A": 0.0, "B": 0.0, "C": 0.0, "S1": 0.0, "S2": 0.0}
            gen_p_scales = {"A": 0.0, "B": 0.0, "C": 0.0, "S1": 0.0, "S2": 0.0}
            
            eq_phases = eq.get("phases") or node_phases
            target_phases = [ph for ph in eq_phases if ph in p_scales]
            if not target_phases: target_phases = ["A", "B", "C"]
            
            if eq_type == "EnergyConsumer":
                p_total = float(eq.get("active_power_w", 1200.0))
                for ph in target_phases:
                    p_scales[ph] += p_total / len(target_phases)
            
            if eq_type in ("PhotovoltaicUnit", "BatteryUnit", "SynchronousMachine", "PowerElectronicsConnection", "EnergySource"):
                g_p = float(eq.get("max_p_w") or eq.get("active_power_w") or eq.get("rated_s_va") or 5000.0)
                for ph in target_phases:
                    gen_p_scales[ph] += g_p / len(target_phases)

            equipment_metrics[eq_name] = {
                "model_id": mid,
                "depth": depth,
                "p_scales": {k: v / 1000.0 for k, v in p_scales.items()},
                "gen_p_scales": {k: v / 1000.0 for k, v in gen_p_scales.items()},
                "phases": eq_phases
            }
    
    return equipment_metrics


def generate_month(equipment_metrics, weather_map, start_dt, end_dt, out_file):
    """Generate sorted parquet file keyed by equipment name."""
    timestamps = []
    curr = start_dt
    while curr < end_dt:
        timestamps.append(curr)
        curr += timedelta(minutes=15)
    
    num_steps = len(timestamps)
    eq_names = list(equipment_metrics.keys())
    
    print(f"    -> Generating {num_steps * len(eq_names):,} records for {start_dt.strftime('%Y-%m')}...")
    
    time_floats = np.array([(ts.hour + ts.minute / 60.0) for ts in timestamps])
    load_factors = 0.6 + 0.4 * np.cos(np.pi * (time_floats - 18) / 12.0)
    solar_factors = np.maximum(0, np.sin(np.pi * (time_floats - 6) / 12.0))
    solar_factors[(time_floats < 6) | (time_floats > 18)] = 0

    temps = np.array([weather_map.get((ts.month, ts.day, ts.hour), 20.0) for ts in timestamps])
    weather_multiplier = 1.0 + np.maximum(0, 18 - temps) * 0.03 + np.maximum(0, temps - 24) * 0.05
    base_load_factors = load_factors * weather_multiplier

    all_data = {k: [] for k in ["node_id", "model_id", "timestamp", "kwh_dlv", "kwh_rcv", "voltage_a", "voltage_b", "voltage_c", "current_a", "current_b", "current_c"]}

    for name in eq_names:
        meta = equipment_metrics[name]
        p = meta["p_scales"]
        g = meta["gen_p_scales"]
        phases = meta["phases"]

        is_a, is_b, is_c = ("A" in phases or "S1" in phases), ("B" in phases or "S2" in phases), ("C" in phases)
        
        kwh_a = (p["A"] + p["S1"]) * base_load_factors * (0.8 + 0.4 * np.random.rand(num_steps)) / 4.0 if is_a else np.zeros(num_steps)
        kwh_b = (p["B"] + p["S2"]) * base_load_factors * (0.8 + 0.4 * np.random.rand(num_steps)) / 4.0 if is_b else np.zeros(num_steps)
        kwh_c = p["C"] * base_load_factors * (0.8 + 0.4 * np.random.rand(num_steps)) / 4.0 if is_c else np.zeros(num_steps)
        
        rcv_a = (g["A"] + g["S1"]) * 1.5 * solar_factors * (0.9 + 0.2 * np.random.rand(num_steps)) / 4.0 if is_a else np.zeros(num_steps)
        rcv_b = (g["B"] + g["S2"]) * 1.5 * solar_factors * (0.9 + 0.2 * np.random.rand(num_steps)) / 4.0 if is_b else np.zeros(num_steps)
        rcv_c = g["C"] * 1.5 * solar_factors * (0.9 + 0.2 * np.random.rand(num_steps)) / 4.0 if is_c else np.zeros(num_steps)

        v_base = 120.0 * (1.0 - meta["depth"] * 0.001)
        va = v_base * (0.995 + 0.01 * np.random.rand(num_steps)) if is_a else [None]*num_steps
        vb = v_base * (0.995 + 0.01 * np.random.rand(num_steps)) if is_b else [None]*num_steps
        vc = v_base * (0.995 + 0.01 * np.random.rand(num_steps)) if is_c else [None]*num_steps

        all_data["node_id"].extend([name] * num_steps)
        all_data["model_id"].extend([meta["model_id"]] * num_steps)
        all_data["timestamp"].extend(timestamps)
        all_data["kwh_dlv"].extend((kwh_a + kwh_b + kwh_c).tolist())
        all_data["kwh_rcv"].extend((rcv_a + rcv_b + rcv_c).tolist())
        all_data["voltage_a"].extend(va if isinstance(va, list) else va.tolist())
        all_data["voltage_b"].extend(vb if isinstance(vb, list) else vb.tolist())
        all_data["voltage_c"].extend(vc if isinstance(vc, list) else vc.tolist())
        all_data["current_a"].extend((kwh_a * 4000.0 / 120.0).tolist())
        all_data["current_b"].extend((kwh_b * 4000.0 / 120.0).tolist())
        all_data["current_c"].extend((kwh_c * 4000.0 / 120.0).tolist())

    table = pa.Table.from_pydict(all_data)
    indices = pa.compute.sort_indices(table, sort_keys=[("node_id", "ascending"), ("timestamp", "ascending")])
    pq.write_table(table.take(indices), out_file, compression='ZSTD', row_group_size=100_000)


def main():
    if os.path.exists(PARQUET_DIR):
        for f in os.listdir(PARQUET_DIR):
            if f.endswith(".parquet"): os.remove(os.path.join(PARQUET_DIR, f))
    else:
        os.makedirs(PARQUET_DIR, exist_ok=True)

    with duckdb.connect(DB_PATH) as conn:
        w_rows = conn.execute("SELECT month, day, hour, temperature FROM weather_recordings").fetchall()
        weather_map = {(r[0], r[1], r[2]): r[3] for r in w_rows}

    metrics = _get_equipment_metrics()
    
    curr = datetime(2025, 1, 1)
    end = datetime.now() + timedelta(days=32)
    
    while curr < end:
        start_month = curr.replace(day=1)
        next_month = (start_month + timedelta(days=32)).replace(day=1)
        generate_month(metrics, weather_map, start_month, next_month, f"{PARQUET_DIR}/readings_unified_{start_month.strftime('%Y_%m')}.parquet")
        curr = next_month

if __name__ == "__main__":
    main()
