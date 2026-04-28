"""Use Case: Aggregate Consumption Analytics."""
import logging
from typing import Dict, Any, List
from src.shared.graph_engine import GraphEngine
from src.shared.meter_data_repository import IMeterDataRepository

logger = logging.getLogger(__name__)


class CalculateAggregateConsumptionUseCase:
    """Use case to calculate aggregate consumption for a given set of nodes and their downstream meters."""

    def __init__(self, graph_engine: GraphEngine, meter_repo: IMeterDataRepository):
        self.graph_engine = graph_engine
        self.meter_repo = meter_repo

    def estimate(self, start_node_ids: List[str], start_time: str, end_time: str) -> Dict[str, Any]:
        """Returns the estimated number of rows to be processed for multiple nodes."""
        all_downstream_nodes = set()
        for node_id in start_node_ids:
            if node_id in all_downstream_nodes:
                continue
            all_downstream_nodes.add(node_id)
            nodes, _ = self.graph_engine.find_downstream(node_id)
            if nodes:
                all_downstream_nodes.update(nodes)

        from src.shared.dependencies import _node_to_energy_consumers
        storage_keys = set()
        for nid in all_downstream_nodes:
            nid_up = nid.upper()
            consumers = _node_to_energy_consumers.get(nid_up, [])
            if consumers:
                storage_keys.update(consumers)

        res = self.meter_repo.estimate_aggregate_consumption(list(storage_keys), start_time, end_time)

        return {
            "estimated_rows": res["estimated_rows"],
            "node_count": len(storage_keys),
            "downstream_node_ids": list(all_downstream_nodes),
        }

    def execute(self, start_node_ids: List[str], start_time: str, end_time: str) -> Dict[str, Any]:
        """
        Aggregates consumption data grouped by timestamp for multiple start nodes.
        """
        try:
            # 1. Determine the scope of the analysis (Connectivity Nodes only)
            all_downstream_nodes = set()
            for node_id in start_node_ids:
                if node_id in all_downstream_nodes:
                    continue
                all_downstream_nodes.add(node_id)
                nodes, _ = self.graph_engine.find_downstream(node_id)
                if nodes:
                    all_downstream_nodes.update(nodes)
            
            # 2. Map Connectivity Nodes to Energy Consumers (Storage Keys)
            from src.shared.dependencies import _node_to_energy_consumers
            storage_keys = set()
            for nid in all_downstream_nodes:
                nid_up = nid.upper()
                consumers = _node_to_energy_consumers.get(nid_up, [])
                if consumers:
                    storage_keys.update(consumers)

            # 3. Run the optimized DuckDB query (without phase weighting)
            if not storage_keys:
                return {
                    "start_node_ids": start_node_ids,
                    "node_count": 0,
                    "total_kwh_delivered": 0,
                    "total_kwh_received": 0,
                    "net_consumption": 0,
                    "time_series": [],
                    "downstream_node_ids": list(all_downstream_nodes),
                }

            results = self.meter_repo.get_aggregate_consumption(list(storage_keys), {}, start_time, end_time)

            # 4. Format response
            time_series = [
                {
                    "timestamp": row["timestamp"],
                    "kwh_delivered": row["kwh_delivered"],
                    "kwh_received": row["kwh_received"],
                    "net_consumption": row["kwh_delivered"] - row["kwh_received"],
                    "temperature": row["temperature"],
                }
                for row in results
            ]

            total_dlv = sum(row["kwh_delivered"] for row in time_series)
            total_rcv = sum(row["kwh_received"] for row in time_series)

            return {
                "start_node_ids": start_node_ids,
                "node_count": len(storage_keys),
                "total_kwh_delivered": total_dlv,
                "total_kwh_received": total_rcv,
                "net_consumption": total_dlv - total_rcv,
                "time_series": time_series,
                "downstream_node_ids": list(all_downstream_nodes),
            }
        except Exception as e:
            logger.exception("Consumption Analysis failed")
            return {"error": str(e)}
