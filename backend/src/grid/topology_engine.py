"""
Topology traversal engine — dependency-free BFS over CIM topology edges.

Replaces NetworkXEngine with a cleaner implementation using dict-based
adjacency lists built from TopologyBuilder's pre-computed edges. No
external graph library dependency; no virtual-edge complexity.

Flow depth (hop-count from the nearest substation source) is computed via
Dijkstra so that spatially-stitched nodes (same lat/lon, zero-cost) share
the same depth as their stitch partners.  When no source nodes exist the
engine falls back to directed-edge-only traversal.
"""
from __future__ import annotations

import heapq
import itertools
import logging
from collections import defaultdict, deque
from typing import Dict, List, Optional, Set, Tuple

from src.shared.graph_engine import GraphEngine
from src.grid.graph_node import GraphNode

logger = logging.getLogger(__name__)


class TopologyEngine(GraphEngine):
    """
    Traversal engine using pre-computed CIM topology edges.

    Edges arrive already correctly oriented (source → load) from
    TopologyBuilder — transformers are explicitly oriented; other equipment
    follows terminal order.  An undirected BFS filtered by flow depth is used
    when source nodes are found, making traversal robust to occasional
    mis-oriented edges in CIM data.

    Spatial stitching: nodes at the same geographic coordinates get zero-cost
    stitch connections so they share the same flow depth, mirroring CIM
    co-location semantics (equipment at the same physical bus).
    """

    def __init__(self):
        self._nodes: Dict[str, GraphNode] = {}
        self._edges: Dict[str, dict] = {}
        # forward_adj[node] = [(neighbor, edge_id), ...]  source → load
        self._forward_adj: Dict[str, List[Tuple[str, str]]] = defaultdict(list)
        # reverse_adj[node] = [(neighbor, edge_id), ...]  load → source
        self._reverse_adj: Dict[str, List[Tuple[str, str]]] = defaultdict(list)
        # stitch_adj[node] = [neighbor, ...]  coincident-location peers (no edge_id)
        self._stitch_adj: Dict[str, List[str]] = defaultdict(list)
        # flow_depth[node_id] = hop-count from nearest source; stitch = 0-cost
        self._flow_depth: Dict[str, int] = {}
        # Per-source cached flow depth maps
        self._source_depth_cache: Dict[str, Dict[str, int]] = {}
        # Per-node cached connected source ID
        self._node_to_source_cache: Dict[str, str] = {}
        # BFS result cache keyed on (start_node_id, direction, max_depth)
        self._bfs_cache: Dict[Tuple, Tuple[List[str], List[str]]] = {}

    # ── GraphEngine interface ──────────────────────────────────────────────

    def build_graph(self, nodes: List[GraphNode] = None, edges: List[dict] = None) -> None:
        self._nodes = {}
        self._edges = {}
        self._forward_adj = defaultdict(list)
        self._reverse_adj = defaultdict(list)
        self._stitch_adj = defaultdict(list)
        self._flow_depth = {}
        self._source_depth_cache = {}
        self._node_to_source_cache = {}
        self._bfs_cache = {}

        if nodes:
            for n in nodes:
                self._nodes[n.id] = n

        if edges:
            for edge in edges:
                if edge.get("virtual"):
                    continue  # skip legacy stitch edges; we rebuild them spatially below
                if edge.get("is_open"):
                    continue  # open switch — do not traverse
                src = edge.get("from_node_id")
                dst = edge.get("to_node_id")
                eid = edge.get("edge_id")
                if not src or not dst or not eid:
                    continue
                self._edges[eid] = edge
                self._forward_adj[src].append((dst, eid))
                self._reverse_adj[dst].append((src, eid))

        # Spatial stitching: nodes at the same lat/lon get zero-cost peer connections.
        # Skip (0.0, 0.0) — it is a placeholder for nodes whose coordinates are
        # unknown; grouping them would incorrectly merge unrelated buses.
        pos_index: Dict[Tuple[float, float], List[str]] = defaultdict(list)
        for nid, node in self._nodes.items():
            if node.latitude is not None and node.longitude is not None:
                lat = round(node.latitude, 8)
                lon = round(node.longitude, 8)
                if lat == 0.0 and lon == 0.0:
                    continue  # sentinel — not a real coordinate
                pos = (lat, lon)
                pos_index[pos].append(nid)

        stitch_group_count = 0
        for node_ids in pos_index.values():
            if len(node_ids) > 1:
                stitch_group_count += 1
                # Star Topology: O(N) connections instead of O(N^2)
                # This prevents BFS bottlenecks in large stitch groups (e.g. substations).
                rep = node_ids[0]
                for other in node_ids[1:]:
                    self._stitch_adj[rep].append(other)
                    self._stitch_adj[other].append(rep)

        self._compute_flow_depth()

        logger.info(
            "[TopologyEngine] built: %d nodes, %d directed edges, %d stitch groups, "
            "%d nodes with flow depth",
            len(self._nodes),
            sum(len(v) for v in self._forward_adj.values()),
            stitch_group_count,
            len(self._flow_depth),
        )

    def find_downstream(self, start_node_id: str, max_depth: int = None) -> Tuple[List[str], List[str]]:
        key = (start_node_id, "downstream", max_depth)
        if key not in self._bfs_cache:
            flow_depth = self._flow_depth_for_node(start_node_id)
            self._bfs_cache[key] = self._bfs(start_node_id, "downstream", max_depth, flow_depth=flow_depth)
        return self._bfs_cache[key]

    def find_upstream(self, start_node_id: str, max_depth: int = None) -> Tuple[List[str], List[str]]:
        key = (start_node_id, "upstream", max_depth)
        if key not in self._bfs_cache:
            flow_depth = self._flow_depth_for_node(start_node_id)
            self._bfs_cache[key] = self._bfs(start_node_id, "upstream", max_depth, flow_depth=flow_depth)
        return self._bfs_cache[key]

    def get_all_neighbors(self, node_id: str) -> list[str]:
        """Return all neighbors of *node_id*: forward edges, reverse edges, and stitch peers.

        Deduplicated; order is forward → reverse → stitch.
        Used by the one-line explorer to trace upstream paths across stitch boundaries.
        """
        seen: set[str] = set()
        result: list[str] = []
        for nb, _ in self._forward_adj.get(node_id, []):
            if nb not in seen:
                seen.add(nb)
                result.append(nb)
        for nb, _ in self._reverse_adj.get(node_id, []):
            if nb not in seen:
                seen.add(nb)
                result.append(nb)
        for nb in self._stitch_adj.get(node_id, []):
            if nb not in seen:
                seen.add(nb)
                result.append(nb)
        return result

    def get_all_edges(self) -> List[dict]:
        """Return all edges in the graph as dictionaries."""
        all_edges = []
        for src, edges in self._forward_adj.items():
            for dst, eid in edges:
                all_edges.append({
                    "from_node_id": src,
                    "to_node_id": dst,
                    "edge_id": eid
                })
        return all_edges

    def get_node_phases(self, node_ids: List[str]) -> Dict[str, List[str]]:
        return {nid: self._nodes[nid].phases for nid in node_ids if nid in self._nodes}

    def get_nodes(self, node_ids: List[str]) -> List[GraphNode]:
        """Returns a list of GraphNode objects for the given IDs."""
        return [self._nodes[nid] for nid in node_ids if nid in self._nodes]

    def get_edges(self, edge_ids: List[str]) -> List[dict]:
        """Returns a list of edge dictionaries for the given IDs."""
        return [self._edges[eid] for eid in edge_ids if eid in self._edges]

    def get_connected_components(self) -> List[Set[str]]:
        """Return a list of connected components as sets of node IDs.

        Uses undirected BFS over all edges (forward + reverse + stitch) so the
        result is independent of edge orientation — matching the behaviour of
        ``nx.connected_components`` on the undirected graph.
        """
        unvisited = set(self._nodes.keys())
        components: List[Set[str]] = []

        while unvisited:
            start = next(iter(unvisited))
            component: Set[str] = set()
            queue: deque[str] = deque([start])
            component.add(start)
            unvisited.discard(start)

            while queue:
                node = queue.popleft()
                neighbors = (
                    [n for n, _ in self._forward_adj[node]]
                    + [n for n, _ in self._reverse_adj[node]]
                    + self._stitch_adj[node]
                )
                for neighbor in neighbors:
                    if neighbor in unvisited:
                        unvisited.discard(neighbor)
                        component.add(neighbor)
                        queue.append(neighbor)

            components.append(component)

        return components

    # ── Public read-only properties (used in tests / diagnostics) ─────────

    @property
    def flow_depth(self) -> Dict[str, int]:
        return self._flow_depth

    # ── Internal helpers ───────────────────────────────────────────────────

    # Nodes at or above this voltage (kV) are treated as transmission-level
    # pseudo-sources when no Substation / EnergySource nodes are present.
    TRANSMISSION_KV_THRESHOLD: float = 69.0

    def _find_topologically_connected_energy_source(self, start_node_id: str) -> Optional[str]:
        """Returns the node ID of the EnergySource connected to *start_node_id* (O(1))."""
        return self._node_to_source_cache.get(start_node_id)

    def _compute_flow_depth_from_source(self, source_id: str) -> Dict[str, int]:
        """Dijkstra from a single *source_id*."""
        dist: Dict[str, int] = {source_id: 0}
        heap: List[Tuple[int, str]] = [(0, source_id)]

        while heap:
            d, node = heapq.heappop(heap)
            if d > dist.get(node, float("inf")):
                continue
            for neighbor, _ in itertools.chain(self._forward_adj[node], self._reverse_adj[node]):
                nd = d + 1
                if nd < dist.get(neighbor, float("inf")):
                    dist[neighbor] = nd
                    heapq.heappush(heap, (nd, neighbor))
            for stitch_nb in self._stitch_adj[node]:
                if d < dist.get(stitch_nb, float("inf")):
                    dist[stitch_nb] = d
                    heapq.heappush(heap, (d, stitch_nb))

        return dist

    def _flow_depth_for_node(self, start_node_id: str) -> Dict[str, int]:
        """Return the flow-depth map anchored to the EnergySource connected to *start_node_id*."""
        source_id = self._find_topologically_connected_energy_source(start_node_id)
        if source_id is None:
            return self._flow_depth
            
        if source_id in self._source_depth_cache:
            return self._source_depth_cache[source_id]
            
        depth_map = self._compute_flow_depth_from_source(source_id)
        self._source_depth_cache[source_id] = depth_map
        return depth_map

    def _compute_flow_depth(self) -> None:
        """Dijkstra from all Substation/EnergySource nodes."""
        sources = [
            nid for nid, n in self._nodes.items()
            if n.type == "Substation"
            or any(eq.get("type") == "EnergySource" for eq in n.attached_equipment)
        ]

        if not sources:
            voltage_nodes = [
                (nid, n.base_voltage_kv)
                for nid, n in self._nodes.items()
                if n.base_voltage_kv is not None and n.base_voltage_kv > 0
            ]
            if voltage_nodes:
                max_kv = max(kv for _, kv in voltage_nodes)
                other_kv = [kv for _, kv in voltage_nodes if kv < max_kv * 0.99]
                if other_kv:
                    sources = [nid for nid, kv in voltage_nodes if kv >= max_kv * 0.99]
                    logger.info(
                        "[TopologyEngine] No Substation/EnergySource — using %d "
                        "max-voltage node(s) (%.2f kV) as pseudo-source(s)",
                        len(sources), max_kv,
                    )

            if not sources:
                logger.warning(
                    "[TopologyEngine] No Substation/EnergySource nodes found — "
                    "traversal will use directed edge orientation only."
                )
                return

        dist: Dict[str, int] = {s: 0 for s in sources}
        source_map: Dict[str, str] = {s: s for s in sources}
        heap: List[Tuple[int, str]] = [(0, s) for s in sources]
        heapq.heapify(heap)

        while heap:
            d, node = heapq.heappop(heap)
            if d > dist.get(node, float("inf")):
                continue

            for neighbor, _ in itertools.chain(self._forward_adj[node], self._reverse_adj[node]):
                nd = d + 1
                if nd < dist.get(neighbor, float("inf")):
                    dist[neighbor] = nd
                    source_map[neighbor] = source_map[node]
                    heapq.heappush(heap, (nd, neighbor))

            for stitch_neighbor in self._stitch_adj[node]:
                if d < dist.get(stitch_neighbor, float("inf")):
                    dist[stitch_neighbor] = d
                    source_map[stitch_neighbor] = source_map[node]
                    heapq.heappush(heap, (d, stitch_neighbor))

        self._flow_depth = dist
        self._node_to_source_cache = source_map
        logger.info(
            "[TopologyEngine] flow depth computed: %d/%d nodes reachable from %d sources",
            len(dist), len(self._nodes), len(sources),
        )

    def _bfs(
        self,
        start_node_id: str,
        direction: str,
        max_depth: Optional[int],
        flow_depth: Optional[Dict[str, int]] = None,
    ) -> Tuple[List[str], List[str]]:
        """BFS traversal with flow-depth direction enforcement.

        When flow depth is available:
          - Undirected BFS so mis-oriented edges are handled gracefully.
          - Skip any neighbor that would move the traversal the wrong way
            (toward source for downstream, away from source for upstream).
          - Stitch neighbors always pass (same depth → filter never triggers).

        When flow depth is unavailable (no source nodes detected):
          - Directed-only BFS: follow forward_adj for downstream,
            reverse_adj for upstream.  Still correct for well-oriented data.

        *flow_depth* overrides ``self._flow_depth`` when provided.  Callers
        (``find_downstream`` / ``find_upstream``) pass a source-anchored depth
        map so that traversal stays within the correct feeder when multiple
        EnergySources are present.
        """
        if start_node_id not in self._nodes:
            logger.warning("[TopologyEngine] start node '%s' not in graph", start_node_id)
            return [], []

        effective_flow_depth = flow_depth if flow_depth is not None else self._flow_depth
        start_depth = effective_flow_depth.get(start_node_id)
        use_flow_depth = bool(effective_flow_depth) and start_depth is not None

        # Voltage-based direction fallback: when flow_depth is unavailable, use
        # the start node's base_voltage_kv to filter traversal direction.
        # Downstream = don't cross to strictly higher voltage (moving toward source).
        # Upstream   = don't cross to strictly lower voltage (moving away from source).
        # This mirrors the one-line explorer's upstream-path logic and handles
        # models where edge orientation is inconsistent (e.g. 9500-node feeder).
        start_node_data = self._nodes.get(start_node_id)
        start_kv = (
            start_node_data.base_voltage_kv
            if start_node_data is not None
            else None
        )
        use_voltage_filter = (
            not use_flow_depth
            and start_kv is not None
            and start_kv > 0
        )

        logger.info(
            "[TopologyEngine] BFS direction=%s start=%s start_depth=%s "
            "use_flow_depth=%s use_voltage_filter=%s start_kv=%s total_nodes=%d",
            direction, start_node_id, start_depth, use_flow_depth,
            use_voltage_filter, start_kv, len(self._nodes),
        )

        nodes_found: Set[str] = set()
        edges_found: Set[str] = set()
        visited: Set[str] = {start_node_id}
        # queue entries: (node_id, hop_count)
        queue: deque[Tuple[str, int]] = deque([(start_node_id, 0)])

        while queue:
            current, hop = queue.popleft()
            if max_depth is not None and hop >= max_depth:
                continue

            curr_lvl = effective_flow_depth.get(current) if use_flow_depth else None

            # ── Real edge neighbors ────────────────────────────────────────
            if use_flow_depth or use_voltage_filter:
                # Undirected: check both directions, filter by depth or voltage
                candidates = itertools.chain(self._forward_adj[current], self._reverse_adj[current])
            else:
                # Directed fallback: only follow edges in the intended direction
                candidates = (
                    self._forward_adj[current]
                    if direction == "downstream"
                    else self._reverse_adj[current]
                )

            for neighbor, edge_id in candidates:
                if neighbor in visited:
                    continue
                if use_flow_depth and curr_lvl is not None:
                    next_lvl = effective_flow_depth.get(neighbor)
                    if next_lvl is not None:
                        if direction == "downstream" and next_lvl < curr_lvl:
                            continue  # moving toward source — skip
                        if direction == "upstream" and next_lvl > curr_lvl:
                            continue  # moving away from source — skip
                elif use_voltage_filter:
                    nb_data = self._nodes.get(neighbor)
                    nb_kv = nb_data.base_voltage_kv if nb_data is not None else None
                    if nb_kv is not None and nb_kv != start_kv:
                        if direction == "downstream" and nb_kv > start_kv:
                            continue  # moving toward higher voltage (source) — skip
                        if direction == "upstream" and nb_kv < start_kv:
                            continue  # moving toward lower voltage (load) — skip
                visited.add(neighbor)
                nodes_found.add(neighbor)
                edges_found.add(edge_id)
                queue.append((neighbor, hop + 1))

            # ── Stitch neighbors ───────────────────────────────────────────
            # Zero-cost connections: always traversable, same hop count,
            # no edge_id contributed to the result.
            for stitch_neighbor in self._stitch_adj[current]:
                if stitch_neighbor not in visited:
                    visited.add(stitch_neighbor)
                    nodes_found.add(stitch_neighbor)
                    queue.append((stitch_neighbor, hop))  # zero cost → same hop level

        logger.info(
            "[TopologyEngine] BFS result: %d nodes, %d edges",
            len(nodes_found), len(edges_found),
        )
        return list(nodes_found), list(edges_found)
