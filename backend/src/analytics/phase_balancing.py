"""Use Case: Phase Balancing Analytics."""
from typing import Dict, Any
from src.shared.graph_engine import GraphEngine
from src.shared.meter_data_repository import IMeterDataRepository

class PhaseBalancingUseCase:
    """Aggregates energy or current across phases to identify imbalances."""
    
    def __init__(self, graph_engine: GraphEngine, meter_repo: IMeterDataRepository):
        self.graph_engine = graph_engine
        self.meter_repo = meter_repo
        
    def execute(self, start_node_id: str, start_time: str, end_time: str) -> Dict[str, Any]:
        """
        Executes the phase balancing query for downstream meters.
        """
        downstream_nodes, downstream_edges = self.graph_engine.find_downstream(start_node_id)
        
        # If no downstream (leaf node like a Meter), query the node itself
        nodes_to_query = list(downstream_nodes) if downstream_nodes else [start_node_id]
             
        res = self.meter_repo.get_phase_balancing(nodes_to_query, start_time, end_time)
        results = res.get("results", [])

        if not results:
            return {
                "median_current_a": 0.0,
                "median_current_b": 0.0,
                "median_current_c": 0.0,
                "total_kwh_delivered": 0.0,
                "imbalance_delta": 0.0,
                "peak_kwh_time": None,
                "peak_kwh": 0.0,
                "peak_current_a": 0.0,
                "peak_current_b": 0.0,
                "peak_current_c": 0.0,
                "start_node_id": start_node_id,
                "node_count": len(nodes_to_query),
                "downstream_node_ids": nodes_to_query,
                "downstream_edge_ids": downstream_edges
            }
            
        def get_median(lst):
            if not lst: return 0.0
            lst.sort()
            mid = len(lst) // 2
            if len(lst) % 2 == 0:
                return (lst[mid - 1] + lst[mid]) / 2.0
            return lst[mid]
            
        current_a_list = [r["current_a"] for r in results if r["current_a"] is not None]
        current_b_list = [r["current_b"] for r in results if r["current_b"] is not None]
        current_c_list = [r["current_c"] for r in results if r["current_c"] is not None]
        
        median_a = get_median(current_a_list)
        median_b = get_median(current_b_list)
        median_c = get_median(current_c_list)
        
        # Simple imbalance metric: max difference between any two phases
        max_current = max(median_a, median_b, median_c)
        min_current = min(median_a, median_b, median_c)
        imbalance_delta = max_current - min_current

        total_kwh = sum(r["kwh"] for r in results if r["kwh"] is not None)
        
        # Peak analysis
        peak_row = max(results, key=lambda x: x["kwh"] or 0)

        return {
            "median_current_a": median_a,
            "median_current_b": median_b,
            "median_current_c": median_c,
            "total_kwh_delivered": total_kwh,
            "imbalance_delta": imbalance_delta,
            "peak_kwh_time": peak_row["timestamp"],
            "peak_kwh": peak_row["kwh"],
            "peak_current_a": peak_row["current_a"],
            "peak_current_b": peak_row["current_b"],
            "peak_current_c": peak_row["current_c"],
            "start_node_id": start_node_id,
            "node_count": len(nodes_to_query),
            "downstream_node_ids": nodes_to_query,
            "downstream_edge_ids": downstream_edges
        }
