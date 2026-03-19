"""NetworkX Graph Engine Implementation."""
import networkx as nx
from typing import List
import itertools
from src.shared.graph_engine import GraphEngine
from src.grid.graph_node import GraphNode

class NetworkXEngine(GraphEngine):
    """Graph engine implementation using NetworkX."""
    
    def __init__(self):
        self.graph = nx.MultiDiGraph()
        self.nodes = {} # id -> GraphNode
        self.pos_to_nodes = {} # (lat, lon) -> list of node_ids
        
    def build_graph(self, nodes: List[GraphNode] = None, edges: List[dict] = None) -> None:
        """Constructs the directed graph with spatial stitching for coincident nodes."""
        self.graph.clear()
        self.nodes = {}
        self.pos_to_nodes = {}
        
        # 1. Register all nodes and build spatial index
        if nodes:
            for node in nodes:
                self.nodes[node.id] = node
                # Register every node in the graph, including isolated ones.
                self.graph.add_node(node.id)
                if node.latitude is not None and node.longitude is not None:
                    pos = (round(node.latitude, 8), round(node.longitude, 8))
                    if pos not in self.pos_to_nodes:
                        self.pos_to_nodes[pos] = []
                    self.pos_to_nodes[pos].append(node.id)
                    
        # 2. Add edges
        if edges:
            for edge in edges:
                self.graph.add_edge(
                    edge["from_node_id"], 
                    edge["to_node_id"], 
                    edge_id=edge["edge_id"],
                    phases=edge.get("phases", ["A", "B", "C"]),
                    is_open=edge.get("is_open", False)
                )
                
        # 3. Perform Spatial Stitching
        # Add virtual edges between nodes at the same physical location
        for pos, node_ids in self.pos_to_nodes.items():
            if len(node_ids) > 1:
                for u, v in itertools.combinations(node_ids, 2):
                    # Add bidirectional virtual "stitch" edges
                    # We use a special prefix so they doesn't get confused with real edges
                    self.graph.add_edge(u, v, edge_id=f"stitch_{u}_{v}", virtual=True)
                    self.graph.add_edge(v, u, edge_id=f"stitch_{v}_{u}", virtual=True)

    def find_downstream(self, start_node_id: str, max_depth: int = None) -> tuple[List[str], List[str]]:
        """Finds all node IDs and edge IDs logically downstream.
        Traverses the directed graph in the forward direction."""
        resolved_start = self._resolve_start_node(start_node_id)
        if resolved_start is None:
            return [], []
            
        return self._bfs_traversal(self.graph, resolved_start, max_depth)

    def find_upstream(self, start_node_id: str, max_depth: int = None) -> tuple[List[str], List[str]]:
        """Finds all node IDs and edge IDs logically upstream.
        Traverses the directed graph in the reverse direction."""
        resolved_start = self._resolve_start_node(start_node_id)
        if resolved_start is None:
            return [], []
            
        # Reverse graph to follow flow "upwards"
        reversed_graph = self.graph.reverse()
        return self._bfs_traversal(reversed_graph, resolved_start, max_depth)

    def _resolve_start_node(self, start_node_id: str) -> str | None:
        """Resolves a traversal start node.

        If the selected node is isolated/disconnected (common in some CIM variants),
        fall back to the nearest connected node by geographic distance.
        """
        if start_node_id not in self.nodes:
            return None

        if start_node_id in self.graph and self.graph.degree(start_node_id) > 0:
            return start_node_id

        start = self.nodes.get(start_node_id)
        if not start or start.latitude is None or start.longitude is None:
            return start_node_id if start_node_id in self.graph else None

        best_node = None
        best_dist = float("inf")

        for node_id in self.graph.nodes:
            if self.graph.degree(node_id) <= 0:
                continue
            candidate = self.nodes.get(node_id)
            if not candidate or candidate.latitude is None or candidate.longitude is None:
                continue

            dist_sq = (candidate.latitude - start.latitude) ** 2 + (candidate.longitude - start.longitude) ** 2
            if dist_sq < best_dist:
                best_dist = dist_sq
                best_node = node_id

        return best_node if best_node is not None else (start_node_id if start_node_id in self.graph else None)

    def _bfs_traversal(self, graph: nx.Graph | nx.DiGraph | nx.MultiDiGraph, start_node_id: str, max_depth: int = None) -> tuple[List[str], List[str]]:
        """Generic BFS traversal for finding nodes and edges."""
        nodes = set()
        edges = set()
        
        queue = [(start_node_id, 0)]
        visited_nodes = {start_node_id}
        
        while queue:
            current_node, depth = queue.pop(0)
            if max_depth is not None and depth >= max_depth:
                continue
                
            # For DiGraph and MultiDiGraph, edges(node) returns all outgoing edges
            # This handles both branched paths and parallel edges between same nodes
            if hasattr(graph, 'edges'):
                for _, neighbor, data in graph.edges(current_node, data=True):
                    # Capture real edge IDs (ignore virtual stitch edges for the result)
                    if "edge_id" in data and not data.get("virtual", False):
                        edges.add(data["edge_id"])
                        
                    # Halt traversal if edge is open
                    if data.get("is_open", False):
                        continue
                        
                    if neighbor not in visited_nodes:
                        visited_nodes.add(neighbor)
                        nodes.add(neighbor)
                        queue.append((neighbor, depth + 1))
            else:
                # Fallback for undirected regular Graph if needed
                for neighbor in graph.neighbors(current_node):
                    edge_data = graph.get_edge_data(current_node, neighbor)
                    if edge_data and "edge_id" in edge_data:
                        edges.add(edge_data["edge_id"])
                    
                    if neighbor not in visited_nodes:
                        visited_nodes.add(neighbor)
                        nodes.add(neighbor)
                        queue.append((neighbor, depth + 1))
                        
        return list(nodes), list(edges)

    def get_node_phases(self, node_ids: List[str]) -> dict[str, List[str]]:
        """Returns a mapping of node IDs to their phase lists."""
        return {nid: self.nodes[nid].phases for nid in node_ids if nid in self.nodes}
