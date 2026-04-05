"""Use Case: Map Edge Load View."""
from typing import Dict, Any, Optional, List
import duckdb
import os
import logging
from datetime import datetime
from pathlib import Path
from src.shared.graph_engine import GraphEngine

logger = logging.getLogger(__name__)

class MapEdgeLoadUseCase:
    """Calculates edge load aggregations with topological summation for map visualization."""
    
    _VALID_AGGS = {
        "mean": "AVG",
        "min": "MIN",
        "max": "MAX",
        "median": "MEDIAN"
    }

    def __init__(self, graph_engine: GraphEngine, db_path: str, parquet_dir: str):
        self.graph_engine = graph_engine
        self.db_path = db_path
        self.parquet_dir = parquet_dir
        
    def _get_parquet_range_files(self, start_time: str, end_time: str) -> List[str]:
        """Prunes the list of Parquet files based on YYYY_MM in filenames."""
        if not os.path.exists(self.parquet_dir):
            return []

        # Parse start/end dates
        try:
            # strip fractional seconds if present to keep it simple, or use fromisoformat
            # fromisoformat handles +HH:MM but not Z prior to 3.11 often.
            # Python 3.11+ handles Z, for older we replace it.
            s = start_time.replace('Z', '+00:00')
            e = end_time.replace('Z', '+00:00')
            start_dt = datetime.fromisoformat(s)
            end_dt = datetime.fromisoformat(e)
        except ValueError as ex:
            logger.warning(f"Malformed date provided to heat map: {start_time} - {ex}")
            # Fallback to all files if dates are malformed
            return [str(p) for p in Path(self.parquet_dir).glob("*.parquet")]

        # Generate covered YYYY_MM strings
        covered_months = set()
        curr = start_dt.replace(day=1)
        while curr.date() <= end_dt.date():
            covered_months.add(curr.strftime("%Y_%m"))
            # Advance to next month
            if curr.month == 12:
                curr = curr.replace(year=curr.year + 1, month=1)
            else:
                curr = curr.replace(month=curr.month + 1)

        all_files = list(Path(self.parquet_dir).glob("readings_unified_*.parquet"))
        relevant_files = []
        for f in all_files:
            # Match readings_unified_YYYY_MM.parquet
            for month_str in covered_months:
                if month_str in f.name:
                    relevant_files.append(str(f))
                    break
        
        # If no unified files matched or they are missing, fallback to everything
        if not relevant_files:
             logger.info("No unified month-stamped files matched range, falling back to all parquet files.")
             relevant_files = [str(p) for p in Path(self.parquet_dir).glob("*.parquet")]

        logger.info(f"Heatmap range {start_time} to {end_time} selected {len(relevant_files)} files: {covered_months}")
        return relevant_files

    def estimate(self, start_time: str, end_time: str, agg: str, start_node_id: Optional[str] = None) -> Dict[str, Any]:
        """Returns row count estimate for the given range."""
        relevant_files = self._get_parquet_range_files(start_time, end_time)
        if not relevant_files:
            return {"estimated_rows": 0, "error": "No load data available in range.", "start_time": start_time, "end_time": end_time}

        # DuckDB can query a list of strings directly
        parquet_list = str([str(f) for f in relevant_files])
        
        query_params = [start_time, end_time]
        prefetch_query = f"""
            SELECT COUNT(*) as estimated_rows
            FROM read_parquet({parquet_list})
            WHERE "timestamp" >= CAST(? AS TIMESTAMP)
              AND "timestamp" <= CAST(? AS TIMESTAMP)
        """
        
        try:
            with duckdb.connect(":memory:") as conn:
                row = conn.execute(prefetch_query, query_params).fetchone()
                return {
                    "estimated_rows": row[0] if row else 0,
                    "start_time": start_time,
                    "end_time": end_time
                }
        except Exception as e:
            return {"estimated_rows": 0, "error": str(e), "start_time": start_time, "end_time": end_time}

    def execute(self, start_time: str, end_time: str, agg: str, start_node_id: Optional[str] = None) -> Dict[str, Any]:
        """Main entry point for load calculation."""
        agg_func = self._VALID_AGGS.get(agg, "AVG")
        relevant_files = self._get_parquet_range_files(start_time, end_time)
        if not relevant_files:
            return {"error": "No load data available in the requested range.", "start_time": start_time, "end_time": end_time}

        parquet_list = str([str(f) for f in relevant_files])
        query_params = [start_time, end_time]

        # 1. Fetch raw load per node
        node_filter = ""
        if start_node_id and start_node_id in self.graph_engine.graph:
            from src.discovery.discover_downstream import DiscoverDownstreamUseCase
            discover = DiscoverDownstreamUseCase(self.graph_engine)
            downstream_nodes, _ = discover.execute(start_node_id)
            if downstream_nodes:
                downstream_nodes.add(start_node_id)
                nodes_to_query = list(downstream_nodes)
                placeholders = ",".join(["?"] * len(nodes_to_query))
                node_filter = f"AND node_id IN ({placeholders})"
                query_params.extend(nodes_to_query)

        node_load_query = f"""
            SELECT 
                node_id, 
                {agg_func}(kwh_dlv) as load
            FROM read_parquet({parquet_list})
            WHERE "timestamp" >= CAST(? AS TIMESTAMP)
              AND "timestamp" <= CAST(? AS TIMESTAMP)
              {node_filter}
            GROUP BY node_id
        """
        
        try:
            with duckdb.connect(":memory:") as conn:
                results = conn.execute(node_load_query, query_params).fetchall()
                
            node_loads = {row[0]: float(row[1]) for row in results if row[1] is not None}
            
            # Use specific error code for zero results to help frontend
            if not node_loads:
                return {
                    "edge_count": 0,
                    "edge_loads": {},
                    "start_time": start_time,
                    "end_time": end_time,
                    "aggregated": True,
                    "warning": "Query returned no reading data for this time range."
                }

            if not hasattr(self.graph_engine, 'graph') or not hasattr(self.graph_engine, 'flow_depth'):
                return {"error": "Graph engine is not initialized or incompatible."}
                
            graph = self.graph_engine.graph
            flow_depth = self.graph_engine.flow_depth
            
            if not flow_depth:
                edge_loads = {}
                for u, v, data in graph.edges(data=True):
                    eid = data.get("edge_id")
                    if eid and v in node_loads:
                        edge_loads[eid] = node_loads[v]
                return {
                    "edge_count": len(edge_loads), 
                    "edge_loads": edge_loads, 
                    "agg": agg, 
                    "aggregated": False,
                    "start_time": start_time,
                    "end_time": end_time
                }

            sorted_nodes = sorted(flow_depth.keys(), key=lambda n: flow_depth[n], reverse=True)
            edge_total_loads = {}
            node_accum_loads = node_loads.copy()

            for node_v in sorted_nodes:
                current_node_load = node_accum_loads.get(node_v, 0.0)
                
                incoming_edges = []
                for u, v, key, data in graph.in_edges(node_v, data=True, keys=True):
                    if data.get("virtual"): continue
                    if flow_depth.get(u, 999999) < flow_depth.get(v, 0):
                        incoming_edges.append((u, v, data))
                
                if not incoming_edges:
                    continue
                
                load_per_edge = current_node_load / len(incoming_edges)
                
                for u, v, data in incoming_edges:
                    eid = data.get("edge_id")
                    if not eid: continue
                    edge_total_loads[eid] = edge_total_loads.get(eid, 0.0) + load_per_edge
                    node_accum_loads[u] = node_accum_loads.get(u, 0.0) + load_per_edge
                
            return {
                "edge_count": len(edge_total_loads),
                "edge_loads": edge_total_loads,
                "agg": agg,
                "aggregated": True,
                "start_time": start_time,
                "end_time": end_time
            }
        except Exception as e:
             logger.exception("Topological aggregation failed")
             return {"error": str(e), "start_time": start_time, "end_time": end_time}
