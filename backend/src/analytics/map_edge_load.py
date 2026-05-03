"""Use Case: Map Edge Load View."""

from typing import Dict, Any, Optional, List
import logging
from src.shared.graph_engine import GraphEngine
from src.shared.meter_data_repository import IMeterDataRepository

logger = logging.getLogger(__name__)

class MapEdgeLoadUseCase:
    """Calculates edge load aggregations with topological summation for map visualization."""

    def __init__(self, graph_engine: GraphEngine, meter_repo: IMeterDataRepository):
        self.graph_engine = graph_engine
        self.meter_repo = meter_repo

    def estimate(
        self,
        start_time: str,
        end_time: str,
        agg: str,
        start_node_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Returns row count estimate for the given range."""
        node_filter = None
        if start_node_id:
            from src.discovery.discover_downstream import DiscoverDownstreamUseCase
            discover = DiscoverDownstreamUseCase(self.graph_engine)
            downstream_nodes, _ = discover.execute(start_node_id)
            if downstream_nodes:
                downstream_nodes.add(start_node_id)
                node_filter = list(downstream_nodes)
            else:
                node_filter = [start_node_id]

        return self.meter_repo.estimate_map_edge_load(start_time, end_time, agg, node_filter)

    def execute(
        self,
        start_time: str,
        end_time: str,
        agg: str,
        start_node_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Main entry point for load calculation."""
        try:
            node_filter = None
            if start_node_id:
                from src.discovery.discover_downstream import DiscoverDownstreamUseCase
                discover = DiscoverDownstreamUseCase(self.graph_engine)
                downstream_nodes, _ = discover.execute(start_node_id)
                if downstream_nodes:
                    downstream_nodes.add(start_node_id)
                    node_filter = list(downstream_nodes)
                else:
                    node_filter = [start_node_id]

            results = self.meter_repo.get_map_edge_load(start_time, end_time, agg, node_filter)
            raw_load_map = {row["node_id"]: row["value"] for row in results}

            # Use the Graph Engine to get the list of all edges for topological summation
            all_edges = self.graph_engine.get_all_edges()

            results_map = {}
            for edge in all_edges:
                # We want load on this edge (u -> v).
                v = edge.get("to_node_id")
                eid = edge.get("edge_id")
                if not v or not eid:
                    continue
                # Find all nodes downstream of v (including v itself)
                nodes, _ = self.graph_engine.find_downstream(v)
                relevant_nodes = set(nodes)
                relevant_nodes.add(v)

                # Sum up their aggregated load
                total = sum(raw_load_map.get(nid, 0) for nid in relevant_nodes)
                results_map[eid] = total
            return {
                "start_time": start_time,
                "end_time": end_time,
                "aggregation": agg,
                "data": results_map,
                "aggregated": True, # For legacy test compatibility
                "edge_loads": results_map, # For legacy test compatibility
                "edge_count": len(results_map) # For legacy test compatibility
            }
        except Exception as e:
            return {"error": str(e)}
