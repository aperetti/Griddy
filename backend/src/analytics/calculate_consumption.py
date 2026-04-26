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
            nodes_objs = self.graph_engine.get_nodes(nodes_to_query)
            
            # Calculate weights for phase aggregation
            node_weights = {}
            for node in nodes_objs:
                nid = node.id
                
                # Rule 1: Look for EnergyConsumers attached to this node first.
                consumers = [eq for eq in node.attached_equipment if eq.get("type") == "EnergyConsumer"]
                
                w = {"A": 0.0, "B": 0.0, "C": 0.0}
                total_weight = 0.0
                
                # Check for primary phases on consumers
                found_primary = False
                if consumers:
                    for eq in consumers:
                        eq_phases = eq.get("phases") or []
                        p_val = float(eq.get("active_power_w") or 1.0)
                        
                        primaries = [p for p in eq_phases if p in ("A", "B", "C")]
                        if primaries:
                            found_primary = True
                            share = p_val / len(primaries)
                            for p in primaries:
                                w[p] += share
                                total_weight += share
                
                # Rule 2: If no primary phases on equipment, check Node phases
                if not found_primary:
                    node_p = node.phases or []
                    primaries = [p for p in node_p if p in ("A", "B", "C")]
                    if primaries:
                        found_primary = True
                        share = 1.0 / len(primaries)
                        for p in primaries:
                            w[p] = share
                            total_weight = 1.0

                # Rule 3: If still no primary phases (e.g. S1/S2 or missing), trace UPSTREAM
                if not found_primary:
                    try:
                        # find_upstream returns (nodes, edges) in BFS order
                        _, upstream_edges = self.graph_engine.find_upstream(nid, max_depth=20)
                        if upstream_edges:
                            edges_data = self.graph_engine.get_edges(upstream_edges)
                            # Find nearest ACLineSegment
                            for edge in edges_data:
                                if edge.get("edge_type") == "ACLineSegment":
                                    line_phases = edge.get("phases") or []
                                    primaries = [p for p in line_phases if p in ("A", "B", "C")]
                                    if primaries:
                                        found_primary = True
                                        share = 1.0 / len(primaries)
                                        for p in primaries:
                                            w[p] = share
                                            total_weight = 1.0
                                        break
                    except Exception as e:
                        logger.warning("Upstream phase trace failed for %s: %s", nid, e)

                # Rule 4: Final balanced fallback
                if not found_primary:
                    w = {"A": 1.0/3.0, "B": 1.0/3.0, "C": 1.0/3.0}
                else:
                    # Normalize weight sum to 1.0
                    if total_weight > 0:
                        for p in ["A", "B", "C"]:
                            w[p] = w[p] / total_weight
                
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
