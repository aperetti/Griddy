"""Use Case: Get Active Alarms."""
from typing import List, Optional
from src.shared.repository import IAlarmRepository
from src.shared.graph_engine import GraphEngine
from src.grid.alarm import Alarm

class GetActiveAlarmsUseCase:
    """Retrieves active alarms for a node or its downstream assets."""

    def __init__(self, repository: IAlarmRepository, graph_engine: GraphEngine):
        self.repository = repository
        self.graph_engine = graph_engine

    def execute(self, node_id: str, include_downstream: bool = True) -> List[Alarm]:
        """
        Executes the alarm retrieval.
        If include_downstream is True, it finds all downstream node IDs 
        and fetches active alarms for any of those nodes.
        """
        target_node_ids = [node_id]
        
        if include_downstream:
            # Find all downstream nodes
            downstream_ids, _ = self.graph_engine.find_downstream(node_id)
            target_node_ids.extend(downstream_ids)
            
        # Deduplicate
        target_node_ids = list(set(target_node_ids))
        
        # We now use the optimized repository method to fetch alarms using an IN clause.
        return self.repository.get_active_alarms_by_nodes(target_node_ids)
