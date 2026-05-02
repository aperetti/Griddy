"""Use Case: Calculate Voltage Distribution Analytics."""
import logging
from typing import Dict, Any, List
from src.shared.graph_engine import GraphEngine
from src.shared.meter_data_repository import IMeterDataRepository
from src.shared.perf import phase_timer

logger = logging.getLogger(__name__)

class CalculateVoltageDistributionUseCase:
    """Calculates voltage statistics (mean, median, stddev) for downstream meters."""

    def __init__(self, graph_engine: GraphEngine, meter_repo: IMeterDataRepository):
        self.graph_engine = graph_engine
        self.meter_repo = meter_repo

    def _resolve_downstream(self, start_node_ids: List[str], degrees: int = None):
        all_downstream_nodes = set()
        all_downstream_edges = set()
        for node_id in start_node_ids:
            all_downstream_nodes.add(node_id)
            nodes, edges = self.graph_engine.find_downstream(node_id, max_depth=degrees)
            all_downstream_nodes.update(nodes)
            all_downstream_edges.update(edges)
        return all_downstream_nodes, all_downstream_edges

    def estimate(self, start_node_ids: List[str], start_time: str, end_time: str, degrees: int = None) -> Dict[str, Any]:
        """Returns the estimated number of rows to be processed for one or more starting nodes."""
        with phase_timer("topology_resolve"):
            all_downstream_nodes, _ = self._resolve_downstream(start_node_ids, degrees)

        with phase_timer("key_resolve"):
            from src.shared.dependencies import resolve_to_storage_keys
            storage_keys = resolve_to_storage_keys(list(all_downstream_nodes))

        with phase_timer("estimate_query"):
            res = self.meter_repo.estimate_voltage_distribution(storage_keys, start_time, end_time)

        return {
            "estimated_rows": res["estimated_rows"],
            "node_count": len(storage_keys)
        }

    def execute(self, start_node_ids: List[str], start_time: str, end_time: str, degrees: int = None) -> Dict[str, Any]:
        """
        Executes the voltage distribution query for one or more starting nodes.
        """
        try:
            with phase_timer("topology_resolve"):
                all_downstream_nodes, all_downstream_edges = self._resolve_downstream(start_node_ids, degrees)

            with phase_timer("key_resolve"):
                from src.shared.dependencies import resolve_to_storage_keys
                storage_keys = resolve_to_storage_keys(list(all_downstream_nodes))

            # Adapter publishes scan / bins / heatmap / stability sub-phases.
            res = self.meter_repo.get_voltage_distribution(storage_keys, start_time, end_time)

            with phase_timer("estimate_for_response"):
                est = self.meter_repo.estimate_voltage_distribution(storage_keys, start_time, end_time)

            with phase_timer("serialize"):
                response = {
                    "distribution": res["distribution"],
                    "scatter": res["scatter"],
                    "timeseries": res["timeseries"],
                    "estimated_rows": est["estimated_rows"],
                    "node_count": len(storage_keys),
                    "downstream_node_ids": list(all_downstream_nodes),
                    "downstream_edge_ids": list(all_downstream_edges)
                }
            return response
        except Exception as e:
            logger.exception("Voltage Analysis failed")
            return {"error": str(e)}
