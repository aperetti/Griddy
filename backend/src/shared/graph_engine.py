"""Core graph engine interface."""
from abc import ABC, abstractmethod
from typing import List, Dict
from src.grid.graph_node import GraphNode

class GraphEngine(ABC):
    """Abstract interface for graph traversal and analytics."""
    
    @abstractmethod
    def build_graph(self, nodes: List[GraphNode], edges: List[dict]) -> None:
        """Constructs the graph in memory."""
        pass
        
    @abstractmethod
    def find_downstream(self, start_node_id: str, max_depth: int = None) -> tuple[List[str], List[str]]:
        """Finds all node IDs and edge IDs downstream of the starting node."""
        pass
        
    @abstractmethod
    def find_upstream(self, start_node_id: str, max_depth: int = None) -> tuple[List[str], List[str]]:
        """Finds all node IDs and edge IDs upstream of the starting node."""
        pass

    @abstractmethod
    def get_all_edges(self) -> List[dict]:
        """Returns a list of all edges in the graph as dictionaries."""
        pass

    @abstractmethod
    def get_node_phases(self, node_ids: List[str]) -> Dict[str, List[str]]:
        """Returns a mapping of node IDs to their phase lists."""
        pass

    @abstractmethod
    def get_nodes(self, node_ids: List[str]) -> List[GraphNode]:
        """Returns a list of GraphNode objects for the given IDs."""
        pass

    @abstractmethod
    def get_edges(self, edge_ids: List[str]) -> List[dict]:
        """Returns a list of edge dictionaries for the given IDs."""
        pass
