"""Use Case: Aggregate Consumption Analytics."""
import logging
from typing import Dict, Any, List
from src.shared.graph_engine import GraphEngine
from src.shared.meter_data_repository import IMeterDataRepository

logger = logging.getLogger(__name__)

class CalculateAggregateConsumptionUseCase:
    """Aggregates kwh_dlv and kwh_rcv over time for downstream meters."""
    
    def __init__(self, graph_engine: GraphEngine, meter_repo: IMeterDataRepository):
        self.graph_engine = graph_engine
        self.meter_repo = meter_repo
        
    def estimate(self, start_node_ids: List[str], start_time: str, end_time: str) -> Dict[str, Any]:
        """Returns the estimated number of rows to be processed for multiple nodes."""
        all_downstream_nodes = set()
        all_downstream_edges = set()
        for node_id in start_node_ids:
            nodes, edges = self.graph_engine.find_downstream(node_id)
            if nodes:
                all_downstream_nodes.update(nodes)
            else:
                all_downstream_nodes.add(node_id)
            if edges:
                all_downstream_edges.update(edges)

        nodes_to_query = list(all_downstream_nodes)
        res = self.meter_repo.estimate_aggregate_consumption(nodes_to_query, start_time, end_time)

        return {
            "estimated_rows": res["estimated_rows"],
            "node_count": len(nodes_to_query),
            "downstream_node_ids": nodes_to_query,
            "downstream_edge_ids": list(all_downstream_edges),
        }

    def execute(self, start_node_ids: List[str], start_time: str, end_time: str) -> Dict[str, Any]:
        """
        Aggregates consumption data grouped by timestamp for multiple start nodes.
        """
        try:
            all_downstream_nodes = set()
            all_downstream_edges = set()
            
            for node_id in start_node_ids:
                nodes, edges = self.graph_engine.find_downstream(node_id)
                if nodes:
                    all_downstream_nodes.update(nodes)
                else:
                    all_downstream_nodes.add(node_id)
                if edges:
                    all_downstream_edges.update(edges)
            
            nodes_to_query = list(all_downstream_nodes)
            node_phases = self.graph_engine.get_node_phases(nodes_to_query)
            
            # Calculate weights for phase aggregation
            node_weights = {}
            for nid in nodes_to_query:
                p_raw = node_phases.get(nid, ["A", "B", "C"]) or ["A", "B", "C"]
                p_list = [p for p in p_raw if p in ("A", "B", "C")]
                w = {"A": 0.0, "B": 0.0, "C": 0.0}
                if p_list:
                    share = 1.0 / len(p_list)
                    for p in p_list:
                        w[p] = share
                else:
                    w = {"A": 1.0/3.0, "B": 1.0/3.0, "C": 1.0/3.0}
                node_weights[nid] = w

            results = self.meter_repo.get_aggregate_consumption(nodes_to_query, node_weights, start_time, end_time)

            time_series = [
                {
                    "timestamp": row["timestamp"],
                    "kwh_delivered": row["kwh_delivered"],
                    "kwh_received": row["kwh_received"],
                    "net_consumption": row["kwh_delivered"] - row["kwh_received"],
                    "kwh_a": row["kwh_a"],
                    "kwh_b": row["kwh_b"],
                    "kwh_c": row["kwh_c"],
                    "temperature": row["temperature"],
                }
                for row in results
            ]

            total_dlv = sum(row["kwh_delivered"] for row in time_series)
            total_rcv = sum(row["kwh_received"] for row in time_series)

            return {
                "start_node_ids": start_node_ids,
                "node_count": len(nodes_to_query),
                "total_kwh_delivered": total_dlv,
                "total_kwh_received": total_rcv,
                "net_consumption": total_dlv - total_rcv,
                "time_series": time_series,
                "downstream_node_ids": nodes_to_query,
                "downstream_edge_ids": list(all_downstream_edges),
            }
        except Exception as e:
            return {"error": str(e)}
