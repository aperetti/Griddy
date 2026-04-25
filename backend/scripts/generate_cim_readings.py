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


def _get_node_metrics():
    """Fetch topology from Neo4j and compute static metrics in memory."""
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

    # 3. Aggregate node properties
    node_metrics = {}
    for n in nodes_raw:
        nid = n["node_id"]
        attached = n.get("attached_equipment", [])
        
        p_total = 0.0
        q_total = 0.0
        gen_p_total = 0.0
        has_gen = False
        
        for eq in attached:
            eq_type = eq.get("type")
            # EnergyConsumer -> load scale
            if eq_type == "EnergyConsumer":
                p_total += eq.get("active_power_w", 1200.0)
                q_total += eq.get("reactive_power_var", 400.0)
            
            # Generation units
            if eq_type in ("PhotovoltaicUnit", "BatteryUnit", "SynchronousMachine", "PowerElectronicsConnection"):
                has_gen = True
                g_p = eq.get("max_p_w") or eq.get("active_power_w") or eq.get("rated_s_va") or 5000.0
                gen_p_total += float(g_p)

        node_metrics[nid] = {
            "model_id": n.get("model_id", "unknown"),
            "base_voltage": n.get("base_voltage_kv") or 12.47,
            "depth": depths.get(nid, 20),
            "p_scale": p_total / 1000.0, # scale in kW
            "q_scale": q_total / 1000.0,
            "gen_p_scale": gen_p_total / 1000.0,
            "has_gen": has_gen,
            "phases": n.get("phases") or ["A", "B", "C"]
        }
    
    return node_metrics


def generate_month(node_metrics, weather_map, start_dt, end_dt, out_file):
    """Generate and write one month of data in memory using NumPy/PyArrow."""
    # 15-minute intervals
    timestamps = []
    curr = start_dt
    while curr < end_dt:
        timestamps.append(curr)
        curr += timedelta(minutes=15)
    
    num_steps = len(timestamps)
    node_ids = list(node_metrics.keys())
    num_nodes = len(node_ids)
    
    print(f"    -> Generating {num_steps * num_nodes:,} records for {start_dt.strftime('%Y-%m')}...")
    
    # Vectorized factors
    time_floats = np.array([(ts.hour + ts.minute / 60.0) for ts in timestamps])
    load_factors = 0.6 + 0.4 * np.cos(np.pi * (time_floats - 18) / 12.0)
    solar_factors = np.maximum(0, np.sin(np.pi * (time_floats - 6) / 12.0))
    solar_factors[(time_floats < 6) | (time_floats > 18)] = 0

    # Weather influence
    temps = np.array([weather_map.get((ts.month, ts.day, ts.hour), 20.0) for ts in timestamps])
    heating = np.maximum(0, 18 - temps) * 0.03 # 3% per deg below 18
    cooling = np.maximum(0, temps - 24) * 0.05 # 5% per deg above 24
    weather_multiplier = 1.0 + heating + cooling

    # Final combined factors
    load_factors = load_factors * weather_multiplier

    # Build columns for PyArrow
    all_nids = []
    all_mids = []
    all_tss = []
    all_kwh_dlv = []
    all_kwh_rcv = []
    all_va = []
    all_vb = []
    all_vc = []
    all_ia = []
    all_ib = []
    all_ic = []

    for nid in node_ids:
        meta = node_metrics[nid]
        mid = meta["model_id"]
        p_scale = meta["p_scale"]
        gen_p_scale = meta["gen_p_scale"]
        depth = meta["depth"]
        has_gen = meta["has_gen"]
        phases = meta["phases"]

        # Random noise per node
        noise = 0.8 + 0.4 * np.random.rand(num_steps)
        
        # Energy Delivered (Load)
        kwh_dlv = p_scale * load_factors * noise / 4.0
        
        # Energy Received (Generation)
        if has_gen:
            # Use gen_p_scale instead of p_scale
            kwh_rcv = gen_p_scale * 1.5 * solar_factors * (0.9 + 0.2 * np.random.rand(num_steps)) / 4.0
        else:
            kwh_rcv = np.zeros(num_steps)

        # Voltage physics: V = BaseV * (1.0 - depth*0.001 - load*0.04)
        v_nominal = 120.0
        v_drop = (depth * 0.001) + (load_factors * 0.04)
        v_noise = 0.995 + 0.01 * np.random.rand(num_steps)
        v_base = v_nominal * (1.0 - v_drop) * v_noise
        
        # Current: I = (P / V) / phases
        phase_count = len([p for p in phases if p in ("A","B","C","S1","S2")])
        if phase_count == 0: phase_count = 1
        i_base = (kwh_dlv * 4.0 * 1000.0 / v_nominal) / phase_count

        all_nids.extend([nid] * num_steps)
        all_mids.extend([mid] * num_steps)
        all_tss.extend(timestamps)
        all_kwh_dlv.extend(kwh_dlv.tolist())
        all_kwh_rcv.extend(kwh_rcv.tolist())
        
        # Phase specific
        has_a = "A" in phases or "S1" in phases
        has_b = "B" in phases or "S2" in phases
        has_c = "C" in phases
        
        all_va.extend(v_base.tolist() if has_a else [None] * num_steps)
        all_vb.extend(v_base.tolist() if has_b else [None] * num_steps)
        all_vc.extend(v_base.tolist() if has_c else [None] * num_steps)
        
        all_ia.extend(i_base.tolist() if has_a else [None] * num_steps)
        all_ib.extend(i_base.tolist() if has_b else [None] * num_steps)
        all_ic.extend(i_base.tolist() if has_c else [None] * num_steps)

    # Create Table
    table = pa.Table.from_pydict({
        "node_id": all_nids,
        "model_id": all_mids,
        "timestamp": all_tss,
        "kwh_dlv": all_kwh_dlv,
        "kwh_rcv": all_kwh_rcv,
        "voltage_a": all_va,
        "voltage_b": all_vb,
        "voltage_c": all_vc,
        "current_a": all_ia,
        "current_b": all_ib,
        "current_c": all_ic
    })
    
    pq.write_table(table, out_file, compression='ZSTD')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-clean", action="store_true", help="Do not clean existing parquet files")
    args = parser.parse_args()

    # Load .env
    try:
        from dotenv import load_dotenv
        load_dotenv(BACKEND_DIR / ".env")
    except ImportError: pass

    print(f"Output parquet dir: {PARQUET_DIR}")
    if os.path.exists(PARQUET_DIR):
        if not args.no_clean:
            print(f"Cleaning existing parquet files...")
            for f in os.listdir(PARQUET_DIR):
                if f.endswith(".parquet"): os.remove(os.path.join(PARQUET_DIR, f))
    else:
        os.makedirs(PARQUET_DIR, exist_ok=True)

    # Phase 0: Weather map
    print("  Loading weather data for physics simulation...")
    with duckdb.connect(DB_PATH) as conn:
        w_rows = conn.execute("SELECT month, day, hour, temperature FROM weather_recordings").fetchall()
        weather_map = {(r[0], r[1], r[2]): r[3] for r in w_rows}

    # Phase 1: In-Memory Analysis
    node_metrics = _get_node_metrics()
    print(f"  Physics metrics cached for {len(node_metrics)} nodes.")

    # Phase 2: Generation Loop
    now = datetime.now()
    target_end_year, target_end_month = now.year, now.month + 1
    if target_end_month > 12:
        target_end_year += 1; target_end_month = 1

    curr_year, curr_month = 2025, 1
    total_start = time.time()
    
    while (curr_year < target_end_year) or (curr_year == target_end_year and curr_month <= target_end_month):
        start_dt = datetime(curr_year, curr_month, 1)
        next_m = curr_month + 1
        next_y = curr_year
        if next_m > 12: next_m, next_y = 1, curr_year + 1
        end_dt = datetime(next_y, next_m, 1)
        
        month_label = start_dt.strftime('%Y_%m')
        out_file = f"{PARQUET_DIR}/readings_unified_{month_label}.parquet"
        
        if os.path.exists(out_file):
            print(f"  -> {month_label}: already exists.")
        else:
            generate_month(node_metrics, weather_map, start_dt, end_dt, out_file)
            
        curr_year, curr_month = next_y, next_m

    print(f"\nBulk generation complete in {time.time() - total_start:.1f}s")


if __name__ == "__main__":
    main()
