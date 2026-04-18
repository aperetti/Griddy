"""Use Case: Calculate Voltage Distribution Analytics."""
import logging
from typing import Dict, Any, List
from src.shared.graph_engine import GraphEngine
from src.shared.meter_data_repository import IMeterDataRepository

logger = logging.getLogger(__name__)

class CalculateVoltageDistributionUseCase:
    """Calculates voltage statistics (mean, median, stddev) for downstream meters."""
    
    def __init__(self, graph_engine: GraphEngine, meter_repo: IMeterDataRepository):
        self.graph_engine = graph_engine
        self.meter_repo = meter_repo
        
    def estimate(self, start_node_ids: List[str], start_time: str, end_time: str, degrees: int = None) -> Dict[str, Any]:
        """Returns the estimated number of rows to be processed for one or more starting nodes."""
        all_downstream_nodes = set()
        for node_id in start_node_ids:
            nodes, _ = self.graph_engine.find_downstream(node_id, max_depth=degrees)
            all_downstream_nodes.update(nodes)
        
        nodes_to_query = list(all_downstream_nodes) if all_downstream_nodes else start_node_ids
        res = self.meter_repo.estimate_voltage_distribution(nodes_to_query, start_time, end_time)

        return {
            "estimated_rows": res["estimated_rows"],
            "node_count": len(nodes_to_query)
        }

    def execute(self, start_node_ids: List[str], start_time: str, end_time: str, degrees: int = None) -> Dict[str, Any]:
        """
        Executes the voltage distribution query for one or more starting nodes.
        """
        try:
            all_downstream_nodes = set()
            all_downstream_edges = set()
            for node_id in start_node_ids:
                nodes, edges = self.graph_engine.find_downstream(node_id, max_depth=degrees)
                all_downstream_nodes.update(nodes)
                all_downstream_edges.update(edges)
                
            nodes_to_query = list(all_downstream_nodes) if all_downstream_nodes else start_node_ids
            
            res = self.meter_repo.get_voltage_distribution(nodes_to_query, start_time, end_time)
            
            # Get estimate for the response
            est = self.meter_repo.estimate_voltage_distribution(nodes_to_query, start_time, end_time)

            return {
                "distribution": res["distribution"],
                "scatter": res["scatter"],
                "timeseries": res["timeseries"],
                "estimated_rows": est["estimated_rows"],
                "node_count": len(nodes_to_query),
                "downstream_node_ids": nodes_to_query,
                "downstream_edge_ids": list(all_downstream_edges)
            }
        except Exception as e:
            return {"error": str(e)}
