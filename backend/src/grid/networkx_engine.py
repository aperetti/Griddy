import networkx as nx
from typing import List, Dict, Set, Optional, Tuple
import itertools
import logging
from src.shared.graph_engine import GraphEngine
from src.grid.graph_node import GraphNode

logger = logging.getLogger(__name__)

class NetworkXEngine(GraphEngine):
    """Graph engine implementation using NetworkX."""
    
    def __init__(self):
        self.graph = nx.MultiDiGraph()
        self.nodes: Dict[str, GraphNode] = {}
        self.pos_to_nodes: Dict[Tuple[float, float], List[str]] = {}
        self.flow_depth: Dict[str, int] = {}  # Node ID -> distance from root source
        
    def build_graph(self, nodes: List[GraphNode] = None, edges: List[dict] = None) -> None:
        """Constructs the directed graph with spatial stitching for coincident nodes."""
        self.graph.clear()
        self.nodes = {}
        self.pos_to_nodes = {}
        self.flow_depth = {}
        
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
        
        # 4. Calculate Logical Flow Depth
        self._calculate_flow_depth()

    def _calculate_flow_depth(self):
        """Pre-calculates logical distance from the nearest substation source.
        Used to ensure traversals only follow intended grid hierarchy.
        """
        sources = []
        for node_id, node in self.nodes.items():
            is_source = node.type == "Substation"
            if not is_source:
                for eq in node.attached_equipment:
                    if eq.get("type") == "EnergySource":
                        is_source = True
                        break
            if is_source:
                sources.append(node_id)

        if not sources:
            logger.warning("No source nodes (Substation/EnergySource) found. Downstream logic will be less robust.")
            return

        # Use undirected graph to find distances regardless of edge orientation
        undirected = self.graph.to_undirected()
        
        # Calculate distance from sources. 
        # Real edges have weight 1, virtual stitches have weight 0 (same physical point).
        def get_weight(u, v, data):
            return 0 if data.get("virtual") else 1

        try:
            # We iterate through all edges to ensure weight attribute is present for Dijkstra
            for u, v, data in undirected.edges(data=True):
                data['weight'] = 0 if data.get('virtual') else 1
                
            self.flow_depth = nx.multi_source_dijkstra_path_length(undirected, sources, weight='weight')
            logger.info("Computed flow depth for %d nodes from %d sources", len(self.flow_depth), len(sources))
        except Exception as e:
            logger.error("Failed to calculate flow depth: %s", str(e))
            self.flow_depth = {}

    def find_downstream(self, start_node_id: str, max_depth: int = None) -> tuple[List[str], List[str]]:
        """Finds all node IDs and edge IDs logically downstream.
        Uses undirected traversal filtered by logical flow depth."""
        resolved_start = self._resolve_start_node(start_node_id)
        if resolved_start is None:
            return [], []
            
        return self._bfs_traversal(resolved_start, max_depth, direction="downstream")

    def find_upstream(self, start_node_id: str, max_depth: int = None) -> tuple[List[str], List[str]]:
        """Finds all node IDs and edge IDs logically upstream.
        Uses undirected traversal filtered by logical flow depth."""
        resolved_start = self._resolve_start_node(start_node_id)
        if resolved_start is None:
            return [], []
            
        return self._bfs_traversal(resolved_start, max_depth, direction="upstream")

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

    def _bfs_traversal(self, start_node_id: str, max_depth: int = None, direction: str = "downstream") -> tuple[List[str], List[str]]:
        """Generic BFS traversal using undirected graph and logical flow depth filtering.
        This approach is robust against incorrectly oriented edges in input data.

        When flow_depth is populated, traversal uses the undirected graph filtered by
        depth (stitch edges have weight=0 so stitched nodes share the same depth and
        are always traversable). When flow_depth is empty (no substation source found),
        fall back to directed graph successors/predecessors so we still enforce direction
        rather than returning the entire connected component.
        """
        nodes = set()
        edges = set()

        queue = [(start_node_id, 0)]
        visited_nodes = {start_node_id}

        use_flow_depth = bool(self.flow_depth)
        start_depth = self.flow_depth.get(start_node_id)
        logger.info(
            "[BFS] direction=%s start=%s start_depth=%s use_flow_depth=%s total_graph_nodes=%d",
            direction, start_node_id, start_depth, use_flow_depth, len(self.graph.nodes)
        )
        undirected = self.graph.to_undirected(as_view=True)

        while queue:
            current_node, depth = queue.pop(0)
            if max_depth is not None and depth >= max_depth:
                continue

            if use_flow_depth:
                # Undirected traversal: flow_depth filter enforces direction.
                # Stitch edges (weight=0) give stitched nodes the same depth, so
                # the `< / >` comparison naturally allows traversal through them.
                candidate_neighbors = list(undirected.neighbors(current_node))
            else:
                # No flow depth — use directed edges as a best-effort direction signal.
                # Stitch edges are added in both directions, so they appear in successors
                # and predecessors and are traversed correctly here too.
                if direction == "downstream":
                    candidate_neighbors = list(self.graph.successors(current_node))
                else:
                    candidate_neighbors = list(self.graph.predecessors(current_node))

            for neighbor in candidate_neighbors:
                if neighbor in visited_nodes:
                    continue

                # Robustness Check: Enforce logical flow direction via pre-calculated depths
                if use_flow_depth:
                    curr_lvl = self.flow_depth.get(current_node)
                    next_lvl = self.flow_depth.get(neighbor)

                    if curr_lvl is not None and next_lvl is not None:
                        if direction == "downstream" and next_lvl < curr_lvl:
                            # Moving back toward source — skip.
                            # `<` (not `<=`) allows same-depth stitch traversal.
                            continue
                        if direction == "upstream" and next_lvl > curr_lvl:
                            # Moving away from source — skip.
                            continue

                # Check edge data (there might be multiple edges between u and v in MultiDiGraph)
                edge_data_list = self.graph.get_edge_data(current_node, neighbor) or {}
                # Also check reverse edges since we are in undirected mode
                reverse_data_list = self.graph.get_edge_data(neighbor, current_node) or {}
                
                # Check edge data
                # MultiDiGraph returns a dict of {key: data}, DiGraph returns data dict directly.
                all_edges = []
                if self.graph.is_multigraph():
                    if edge_data_list:
                        all_edges.extend(edge_data_list.values())
                    if reverse_data_list:
                        all_edges.extend(reverse_data_list.values())
                else:
                    if edge_data_list:
                        all_edges.append(edge_data_list)
                    if reverse_data_list:
                        all_edges.append(reverse_data_list)

                is_blocked = True
                for data in all_edges:
                    # Capture real edge IDs (ignore virtual stitch edges for the result)
                    if "edge_id" in data and not data.get("virtual", False):
                        edges.add(data["edge_id"])
                        
                    # If AT LEAST ONE edge is not open, we can pass
                    if not data.get("is_open", False):
                        is_blocked = False
                
                if not is_blocked:
                    visited_nodes.add(neighbor)
                    nodes.add(neighbor)
                    queue.append((neighbor, depth + 1))
                         
        logger.info("[BFS] result: %d nodes, %d edges returned", len(nodes), len(edges))
        return list(nodes), list(edges)

    def get_node_phases(self, node_ids: List[str]) -> dict[str, List[str]]:
        """Returns a mapping of node IDs to their phase lists."""
        return {nid: self.nodes[nid].phases for nid in node_ids if nid in self.nodes}
