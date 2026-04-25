"""InMemory Synthetic Data Adapter — generates meter readings on-the-fly from CIM topology."""

import os
import json
import logging
import random
import time
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from src.shared.meter_data_repository import (
    IMeterDataRepository, 
    EstimateResult, 
    ConsumptionTimeseriesPoint, 
    VoltageDistributionResult, 
    MapAggregationPoint, 
    PhaseBalancingResult
)
from src.shared.cim_registry import CimModelRegistry

logger = logging.getLogger(__name__)

class InMemoryMeterDataRepository(IMeterDataRepository):
    """
    Implementation of IMeterDataRepository that synthesizes readings in memory.
    Scaling is driven by CIM properties (EnergyConsumer.p, .q) and connectivity (PV/Battery).
    """
    
    name = "in_memory"
    label = "In-Memory Synthetic Data"

    def __init__(self, db_path: str = None, parquet_dir: str = None):
        # We ignore these parameters as we are in-memory
        self._node_cache: Dict[str, Dict[str, Any]] = {}  # node_id -> metrics
        self._initialized = False

    def _ensure_initialized(self):
        if self._initialized:
            return
        
        logger.info("Initializing InMemory synthetic adapter...")
        registry = CimModelRegistry.get_instance()
        # Ensure all models are loaded from Neo4j/disk
        try:
            registry.load_all()
        except Exception as e:
            logger.error(f"Failed to load registry: {e}")
            return

        nodes_raw, edges_raw = registry.get_combined_topology()
        
        # 1. Build adjacency list for BFS
        adj = {}
        for e in edges_raw:
            u, v = e["from_node_id"], e["to_node_id"]
            adj.setdefault(u, []).append(v)
            adj.setdefault(v, []).append(u)

        # 2. BFS for depth from substations
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
            if d >= 30: continue # limit depth
            for v in adj.get(u, []):
                if v not in depths:
                    depths[v] = d + 1
                    queue.append((v, d + 1))

        # 3. Extract node properties
        for n in nodes_raw:
            nid = n["node_id"]
            attached = n.get("attached_equipment", [])
            
            p_total = 0.0
            q_total = 0.0
            has_gen = False
            
            for eq in attached:
                # EnergyConsumer -> p, q
                if eq.get("type") == "EnergyConsumer":
                    p_total += eq.get("active_power_w", 1000.0) # fallback 1kW
                    q_total += eq.get("reactive_power_var", 300.0) # fallback 0.3kVAR
                
                # PV, Battery, SyncMachine -> generation
                if eq.get("type") in ("PhotovoltaicUnit", "BatteryUnit", "SynchronousMachine"):
                    has_gen = True

            self._node_cache[nid] = {
                "base_voltage": n.get("base_voltage_kv") or 12.47, # fallback 12.47kV
                "depth": depths.get(nid, 20), # fallback deep if unreachable
                "p_scale": p_total / 1000.0, # scale factor in kW
                "q_scale": q_total / 1000.0,
                "has_gen": has_gen,
                "phases": n.get("phases") or ["A", "B", "C"]
            }
        
        self._initialized = True
        logger.info(f"InMemory adapter ready with {len(self._node_cache)} nodes.")

    def _generate_vectorized(self, node_ids: List[str], start_time: str, end_time: str):
        """Internal helper to generate numpy-backed timeseries."""
        self._ensure_initialized()
        
        # Parse timeframe
        s_dt = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
        e_dt = datetime.fromisoformat(end_time.replace("Z", "+00:00"))
        
        # 15-minute intervals
        timestamps = []
        curr = s_dt
        while curr <= e_dt:
            timestamps.append(curr)
            curr += timedelta(minutes=15)
        
        if not timestamps: return [], {}

        num_steps = len(timestamps)
        
        # Diurnal load curve (simulated)
        hours = np.array([ts.hour for ts in timestamps])
        minutes = np.array([ts.minute for ts in timestamps])
        time_float = hours + minutes / 60.0
        
        # Load: peaks at 18:00 (6 PM), minimum at 04:00
        # Formula: 0.6 + 0.4 * cos(pi * (t - 18) / 12)
        load_factor = 0.6 + 0.4 * np.cos(np.pi * (time_float - 18) / 12.0)
        
        # Solar: peaks at 12:00, zero before 06:00 and after 18:00
        solar_factor = np.maximum(0, np.sin(np.pi * (time_float - 6) / 12.0))
        solar_factor[ (time_float < 6) | (time_float > 18) ] = 0
        
        results = {}
        for nid in node_ids:
            meta = self._node_cache.get(nid, {
                "base_voltage": 12.47, "depth": 10, "p_scale": 5.0, "q_scale": 1.0, "has_gen": False, "phases": ["A","B","C"]
            })
            
            # Base load with random noise
            noise = 0.8 + 0.4 * np.random.rand(num_steps)
            kwh_dlv = meta["p_scale"] * load_factor * noise / 4.0 # 15 min intervals
            kvarh_dlv = meta["q_scale"] * load_factor * noise / 4.0
            
            # Generation
            if meta["has_gen"]:
                kwh_rcv = meta["p_scale"] * 1.5 * solar_factor * noise / 4.0
            else:
                kwh_rcv = np.zeros(num_steps)
                
            # Voltage: drop increases with depth and load
            # base * (1.0 - depth*0.002 - load*0.03)
            # Center on 120V nominal for display if primary side
            v_base = 120.0
            v_drop = (meta["depth"] * 0.001) + (load_factor * 0.04)
            v_noise = 0.99 + 0.02 * np.random.rand(num_steps)
            voltage = v_base * (1.0 - v_drop) * v_noise
            
            results[nid] = {
                "kwh_dlv": kwh_dlv,
                "kwh_rcv": kwh_rcv,
                "voltage": voltage,
                "phases": meta["phases"]
            }
            
        return timestamps, results

    def estimate_aggregate_consumption(self, node_ids: List[str], start_time: str, end_time: str) -> EstimateResult:
        # Just return number of steps * nodes
        s_dt = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
        e_dt = datetime.fromisoformat(end_time.replace("Z", "+00:00"))
        steps = int((e_dt - s_dt).total_seconds() / (15 * 60)) + 1
        return {"estimated_rows": steps * len(node_ids)}

    def get_aggregate_consumption(self, node_ids: List[str], node_weights: Dict[str, Dict[str, float]], start_time: str, end_time: str) -> List[ConsumptionTimeseriesPoint]:
        timestamps, data = self._generate_vectorized(node_ids, start_time, end_time)
        if not timestamps: return []
        
        num_steps = len(timestamps)
        total_dlv = np.zeros(num_steps)
        total_rcv = np.zeros(num_steps)
        total_a = np.zeros(num_steps)
        total_b = np.zeros(num_steps)
        total_c = np.zeros(num_steps)
        
        for nid in node_ids:
            if nid not in data: continue
            d = data[nid]
            total_dlv += d["kwh_dlv"]
            total_rcv += d["kwh_rcv"]
            
            # Distribute across phases
            w = node_weights.get(nid, {"A": 1/3.0, "B": 1/3.0, "C": 1/3.0})
            total_a += d["kwh_dlv"] * w.get("A", 0.0)
            total_b += d["kwh_dlv"] * w.get("B", 0.0)
            total_c += d["kwh_dlv"] * w.get("C", 0.0)
            
        points = []
        for i, ts in enumerate(timestamps):
            points.append({
                "timestamp": ts.isoformat() + "Z",
                "kwh_delivered": float(total_dlv[i]),
                "kwh_received": float(total_rcv[i]),
                "kwh_a": float(total_a[i]),
                "kwh_b": float(total_b[i]),
                "kwh_c": float(total_c[i]),
                "temperature": 20.0 + 5.0 * np.sin(np.pi * (ts.hour - 6) / 12.0) # Mock temp
            })
        return points

    def estimate_voltage_distribution(self, node_ids: List[str], start_time: str, end_time: str) -> EstimateResult:
        return self.estimate_aggregate_consumption(node_ids, start_time, end_time)

    def get_voltage_distribution(self, node_ids: List[str], start_time: str, end_time: str) -> VoltageDistributionResult:
        timestamps, data = self._generate_vectorized(node_ids, start_time, end_time)
        if not timestamps: return {"distribution": [], "scatter": [], "timeseries": []}
        
        # 1. Distribution (Bins)
        all_v = []
        for nid in node_ids:
            if nid in data: all_v.extend(data[nid]["voltage"])
        
        v_bins = {}
        for v in all_v:
            b = round(v * 2) / 2.0
            v_bins[b] = v_bins.get(b, 0) + 1
            
        dist = [{"voltage": b, "phase_a": c, "phase_b": c, "phase_c": c} for b, c in sorted(v_bins.items())]
        
        # 2. Timeseries (Stability)
        num_steps = len(timestamps)
        p10, p50, p90 = [], [], []
        for i in range(num_steps):
            step_v = [data[nid]["voltage"][i] for nid in node_ids if nid in data]
            if step_v:
                p10.append(float(np.percentile(step_v, 10)))
                p50.append(float(np.percentile(step_v, 50)))
                p90.append(float(np.percentile(step_v, 90)))
            else:
                p10.append(120.0); p50.append(120.0); p90.append(120.0)
                
        timeseries = []
        for i, ts in enumerate(timestamps):
            if i % 4 == 0: # 1 hour intervals for stability
                timeseries.append({"date": ts.isoformat() + "Z", "p10": p10[i], "p50": p50[i], "p90": p90[i]})
        
        return {
            "distribution": dist,
            "scatter": [], # Omitting scatter for perf in-memory
            "timeseries": timeseries
        }

    def estimate_map_voltage(self, start_time: str, end_time: str, agg: str, node_filter: Optional[List[str]] = None) -> EstimateResult:
        self._ensure_initialized()
        ids = node_filter if node_filter else list(self._node_cache.keys())
        return self.estimate_aggregate_consumption(ids[:100], start_time, end_time)

    def get_map_voltage(self, start_time: str, end_time: str, agg: str, node_filter: Optional[List[str]] = None) -> List[MapAggregationPoint]:
        self._ensure_initialized()
        ids = node_filter if node_filter else list(self._node_cache.keys())
        # To avoid massive compute, we take a 1-step sample for the map if the range is large
        timestamps, data = self._generate_vectorized(ids, start_time, start_time) 
        if not data: return []
        
        return [{"node_id": nid, "value": float(d["voltage"][0])} for nid, d in data.items()]

    def estimate_map_edge_load(self, start_time: str, end_time: str, agg: str, node_filter: Optional[List[str]] = None) -> EstimateResult:
        return self.estimate_map_voltage(start_time, end_time, agg, node_filter)

    def get_map_edge_load(self, start_time: str, end_time: str, agg: str, node_filter: Optional[List[str]] = None) -> List[MapAggregationPoint]:
        self._ensure_initialized()
        ids = node_filter if node_filter else list(self._node_cache.keys())
        timestamps, data = self._generate_vectorized(ids, start_time, start_time)
        if not data: return []
        
        return [{"node_id": nid, "value": float(d["kwh_dlv"][0])} for nid, d in data.items()]

    def get_phase_balancing(self, node_ids: List[str], start_time: str, end_time: str) -> PhaseBalancingResult:
        timestamps, data = self._generate_vectorized(node_ids, start_time, end_time)
        if not timestamps: return {}
        
        results = []
        for i, ts in enumerate(timestamps):
            c_a, c_b, c_c, kwh = 0.0, 0.0, 0.0, 0.0
            for nid in node_ids:
                if nid not in data: continue
                d = data[nid]
                # Mock current from load
                load = d["kwh_dlv"][i]
                kwh += load
                c_a += load * 2.5 + random.random()
                c_b += load * 2.5 + random.random()
                c_c += load * 2.5 + random.random()
                
            results.append({
                "timestamp": ts.isoformat() + "Z",
                "current_a": c_a,
                "current_b": c_b,
                "current_c": c_c,
                "kwh": kwh
            })
            
        return {"results": results}
