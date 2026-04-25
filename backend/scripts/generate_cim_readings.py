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
        node_phases = n.get("phases") or ["A", "B", "C"]
        
        # Per-phase scales
        p_scales = {"A": 0.0, "B": 0.0, "C": 0.0, "S1": 0.0, "S2": 0.0}
        q_scales = {"A": 0.0, "B": 0.0, "C": 0.0, "S1": 0.0, "S2": 0.0}
        gen_p_scales = {"A": 0.0, "B": 0.0, "C": 0.0, "S1": 0.0, "S2": 0.0}
        has_gen = False
        
        for eq in attached:
            eq_type = eq.get("type")
            eq_phases = eq.get("phases") or node_phases
            
            # Filter to phases actually on this equipment
            target_phases = [ph for ph in eq_phases if ph in p_scales]
            if not target_phases: target_phases = ["A", "B", "C"] # Fallback
            
            # EnergyConsumer -> load scale
            if eq_type == "EnergyConsumer":
                p_total = float(eq.get("active_power_w", 1200.0))
                q_total = float(eq.get("reactive_power_var", 400.0))
                
                # Split total equipment load across its phases
                for ph in target_phases:
                    p_scales[ph] += p_total / len(target_phases)
                    q_scales[ph] += q_total / len(target_phases)
            
            # Generation units
            if eq_type in ("PhotovoltaicUnit", "BatteryUnit", "SynchronousMachine", "PowerElectronicsConnection"):
                has_gen = True
                g_p = float(eq.get("max_p_w") or eq.get("active_power_w") or eq.get("rated_s_va") or 5000.0)
                for ph in target_phases:
                    gen_p_scales[ph] += g_p / len(target_phases)

        node_metrics[nid] = {
            "model_id": n.get("model_id", "unknown"),
            "base_voltage": n.get("base_voltage_kv") or 12.47,
            "depth": depths.get(nid, 20),
            "p_scales": {k: v / 1000.0 for k, v in p_scales.items()}, # kW
            "q_scales": {k: v / 1000.0 for k, v in q_scales.items()},
            "gen_p_scales": {k: v / 1000.0 for k, v in gen_p_scales.items()},
            "has_gen": has_gen,
            "phases": node_phases
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

    # Final load factor curve
    base_load_factors = load_factors * weather_multiplier

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
        p_scales = meta["p_scales"]
        gen_p_scales = meta["gen_p_scales"]
        depth = meta["depth"]
        phases = meta["phases"]

        # Phase flags
        is_a = "A" in phases or "S1" in phases
        is_b = "B" in phases or "S2" in phases
        is_c = "C" in phases

        # 1. Unbalanced Energy Delivered (Load) - used for internal physics calculation
        # Independent noise per phase to ensure unbalance
        noise_a = 0.8 + 0.4 * np.random.rand(num_steps) if is_a else np.zeros(num_steps)
        noise_b = 0.8 + 0.4 * np.random.rand(num_steps) if is_b else np.zeros(num_steps)
        noise_c = 0.8 + 0.4 * np.random.rand(num_steps) if is_c else np.zeros(num_steps)

        kwh_a = (p_scales["A"] + p_scales["S1"]) * base_load_factors * noise_a / 4.0
        kwh_b = (p_scales["B"] + p_scales["S2"]) * base_load_factors * noise_b / 4.0
        kwh_c = p_scales["C"] * base_load_factors * noise_c / 4.0
        
        # Output total delivered energy
        total_kwh_dlv = kwh_a + kwh_b + kwh_c

        # 2. Energy Received (Generation)
        noise_gen = 0.9 + 0.2 * np.random.rand(num_steps)
        kwh_rcv_a = (gen_p_scales["A"] + gen_p_scales["S1"]) * 1.5 * solar_factors * noise_gen / 4.0
        kwh_rcv_b = (gen_p_scales["B"] + gen_p_scales["S2"]) * 1.5 * solar_factors * noise_gen / 4.0
        kwh_rcv_c = gen_p_scales["C"] * 1.5 * solar_factors * noise_gen / 4.0
        
        # Output total received energy
        total_kwh_rcv = kwh_rcv_a + kwh_rcv_b + kwh_rcv_c

        # 3. Unbalanced Voltage Physics: V = BaseV * (1.0 - depth*0.001 - phase_load*0.06)
        v_nominal = 120.0
        depth_drop = (depth * 0.001)
        
        v_noise_a = 0.995 + 0.01 * np.random.rand(num_steps)
        v_noise_b = 0.995 + 0.01 * np.random.rand(num_steps)
        v_noise_c = 0.995 + 0.01 * np.random.rand(num_steps)
        
        # Load-based drop is per-phase
        va = v_nominal * (1.0 - depth_drop - (kwh_a * 4.0 / (p_scales["A"]+p_scales["S1"]+0.1)) * 0.04) * v_noise_a if is_a else [None]*num_steps
        vb = v_nominal * (1.0 - depth_drop - (kwh_b * 4.0 / (p_scales["B"]+p_scales["S2"]+0.1)) * 0.04) * v_noise_b if is_b else [None]*num_steps
        vc = v_nominal * (1.0 - depth_drop - (kwh_c * 4.0 / (p_scales["C"]+0.1)) * 0.04) * v_noise_c if is_c else [None]*num_steps
        
        # 4. Current: I = (P / V)
        ia = (kwh_a * 4.0 * 1000.0 / v_nominal) if is_a else [None]*num_steps
        ib = (kwh_b * 4.0 * 1000.0 / v_nominal) if is_b else [None]*num_steps
        ic = (kwh_c * 4.0 * 1000.0 / v_nominal) if is_c else [None]*num_steps

        all_nids.extend([nid] * num_steps)
        all_mids.extend([mid] * num_steps)
        all_tss.extend(timestamps)
        all_kwh_dlv.extend(total_kwh_dlv.tolist())
        all_kwh_rcv.extend(total_kwh_rcv.tolist())
        
        all_va.extend(va if isinstance(va, list) else va.tolist())
        all_vb.extend(vb if isinstance(vb, list) else vb.tolist())
        all_vc.extend(vc if isinstance(vc, list) else vc.tolist())
        
        all_ia.extend(ia if isinstance(ia, list) else ia.tolist())
        all_ib.extend(ib if isinstance(ib, list) else ib.tolist())
        all_ic.extend(ic if isinstance(ic, list) else ic.tolist())

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
