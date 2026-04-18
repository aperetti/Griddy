"""Use Case: Map Voltage View."""

from typing import Dict, Any, Optional, List
import logging
from src.shared.graph_engine import GraphEngine
from src.shared.meter_data_repository import IMeterDataRepository

logger = logging.getLogger(__name__)

class MapVoltageUseCase:
    """Calculates voltage aggregations for map visualization."""

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

        return self.meter_repo.estimate_map_voltage(start_time, end_time, agg, node_filter)

    def execute(
        self,
        start_time: str,
        end_time: str,
        agg: str,
        start_node_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Main entry point for voltage calculation."""
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

            results = self.meter_repo.get_map_voltage(start_time, end_time, agg, node_filter)
            data = {row["node_id"]: row["value"] for row in results}

            return {
                "start_time": start_time,
                "end_time": end_time,
                "aggregation": agg,
                "data": data,
                "node_voltages": data,
                "node_currents": {},
                "node_count": len(data),
                "start_node_id": start_node_id,
                "agg": agg
            }
        except Exception as e:
            return {"error": str(e)}
