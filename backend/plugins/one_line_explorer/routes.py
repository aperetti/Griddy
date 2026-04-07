"""One-Line Explorer plugin — backend routes.

GET /api/plugins/one-line-explorer/diagram/{node_id}?depth=2

Returns a one-line diagram payload with two regions:

  upstream — the full shortest path from the nearest EnergySource node to the
             selected node (no depth cap).  Every node on that path is included
             so the diagram always shows the complete "one line to source".

  downstream — a depth-limited BFS neighbourhood *from* the selected node,
               excluding nodes already on the upstream path.

ConnectivityNodes become bus bars; equipment edges become connections.

Implementation notes
--------------------
* We build a plain undirected networkx graph from the full topology and use
  ego_graph (downstream) and shortest_path (upstream) for subgraph extraction.
* Virtual stitch edges (same-coordinate stitching) are excluded.
* Attached equipment (EnergyConsumer, EnergySource, Capacitor) is inlined into
  each bus bar node so the frontend can render badges / tooltips.
* Each node carries node_role ∈ {"upstream","centre","downstream"} so the
  frontend can colour and position them correctly.
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Optional
import logging

import networkx as nx

from src.grid.topology_engine import TopologyEngine
from src.shared.dependencies import (
    registry,
    ensure_graph_built,
    get_active_model_ids,
    graph_engine,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/plugins/one-line-explorer", tags=["one_line_explorer"])

_TRANSMISSION_KV_THRESHOLD = TopologyEngine.TRANSMISSION_KV_THRESHOLD


def _find_upstream_path(G: nx.Graph, node_map: dict, node_id: str) -> list[str]:
    """Return the ordered path [upstream_target, ..., node_id].

    Strategy — unified depth-constrained BFS
    ------------------------------------------
    BFS upstream from ``node_id`` following *decreasing* ``flow_depth``.
    Stop at the first node that satisfies any of:

    * ``base_voltage_kv`` strictly greater than the selected node's voltage
      (when voltage data is available on both sides).
    * ``node_type == "Substation"``
    * ``flow_depth == 0`` (feeder head)
    * Attached equipment includes an ``EnergySource``

    When ``flow_depth`` is unavailable for either current or neighbour node,
    we still allow traversal (don't skip) so that sparse data doesn't block
    legitimate paths.

    Falls back to ``nx.shortest_path`` from any root-like node if BFS
    finds nothing.
    """
    from collections import deque as _deque

    flow_depth = graph_engine.flow_depth
    node_raw = node_map.get(node_id) or {}
    selected_kv = node_raw.get("base_voltage_kv")
    selected_fd = flow_depth.get(node_id)

    logger.info(
        "[upstream] node_id=%s  kv=%s  depth=%s  neighbors=%d  name=%s",
        node_id, selected_kv, selected_fd,
        len(list(G.neighbors(node_id))), node_raw.get("name", ""),
    )

    # Quick-exit: already at feeder head
    if selected_fd == 0:
        logger.info("[upstream] quick-exit: flow_depth==0")
        return [node_id]

    # ── Unified upstream BFS ──────────────────────────────────────────────
    def _is_upstream_target(nid: str) -> bool:
        """Return True if *nid* qualifies as where the upstream trace stops."""
        n = node_map.get(nid) or {}
        # Higher voltage than selected node (voltage-gated stop)
        if selected_kv is not None and selected_kv > 0:
            nb_kv = n.get("base_voltage_kv")
            if nb_kv is not None and nb_kv > selected_kv:
                return True
        # Substation
        if n.get("node_type") == "Substation":
            return True
        # Feeder head
        if flow_depth.get(nid) == 0:
            return True
        # Energy source attached
        if any(eq.get("type") == "EnergySource"
               for eq in n.get("attached_equipment", [])):
            return True
        return False

    parent: dict[str, str | None] = {node_id: None}
    queue: _deque[str] = _deque([node_id])
    target: str | None = None
    visited = 0
    skipped_downstream = 0

    while queue and target is None:
        cur = queue.popleft()
        visited += 1
        cur_fd = flow_depth.get(cur)

        for nb in G.neighbors(cur):
            if nb in parent:
                continue

            nb_fd = flow_depth.get(nb)

            # Direction filter: only move upstream (decreasing flow_depth).
            # If either depth value is None we allow the edge (sparse data).
            if cur_fd is not None and nb_fd is not None and nb_fd > cur_fd:
                skipped_downstream += 1
                continue

            parent[nb] = cur

            if _is_upstream_target(nb):
                target = nb
                break
            queue.append(nb)

    if target is not None:
        # Reconstruct  target → ... → node_id
        path: list[str] = []
        c: str | None = target
        while c is not None:
            path.append(c)
            c = parent[c]
        logger.info(
            "[upstream] BFS found target after visiting=%d skipped=%d, path len=%d",
            visited, skipped_downstream, len(path),
        )
        return path

    logger.info(
        "[upstream] BFS exhausted: visited=%d skipped=%d. Falling to fallbacks.",
        visited, skipped_downstream,
    )

    # ── Fallback A: topology engine's directed-edge upstream ──────────────
    upstream_set, _ = graph_engine.find_upstream(node_id)
    if upstream_set:
        # Sort by hop distance from node_id (furthest first)
        hop_dist = nx.single_source_shortest_path_length(G, node_id)
        root = max(upstream_set, key=lambda n: hop_dist.get(n, 0))
        try:
            path = nx.shortest_path(G, root, node_id)
            logger.info("[upstream] directed fallback path len=%d from %s",
                        len(path), root[:20])
            return path
        except nx.NetworkXNoPath:
            pass

    # ── Fallback B: nx shortest-path from any root-like node ──────────────
    source_nodes = [
        nid for nid, n in node_map.items()
        if nid in G and nid != node_id and (
            n.get("node_type") == "Substation"
            or any(eq.get("type") == "EnergySource"
                   for eq in n.get("attached_equipment", []))
            or flow_depth.get(nid) == 0
        )
    ]

    best: list[str] | None = None
    for src in source_nodes:
        try:
            p = nx.shortest_path(G, src, node_id)
        except nx.NetworkXNoPath:
            continue
        if best is None or len(p) < len(best):
            best = p

    if best:
        logger.info("[upstream] nx fallback found path len=%d", len(best))
        return best

    return [node_id]



def _build_undirected_topology(model_ids: list[str]) -> tuple[dict, list[dict], nx.Graph]:
    """Return (node_map, edges, undirected_graph) for the given model set."""
    nodes_raw, edges_raw = registry.get_combined_topology(model_ids)

    node_map: dict[str, dict] = {n["node_id"]: n for n in nodes_raw}

    G = nx.Graph()
    for n in nodes_raw:
        G.add_node(n["node_id"])

    real_edges: list[dict] = []
    for e in edges_raw:
        if e.get("edge_id", "").startswith("stitch_"):
            continue
        G.add_edge(
            e["from_node_id"],
            e["to_node_id"],
            edge_id=e["edge_id"],
            data=e,
        )
        real_edges.append(e)

    return node_map, real_edges, G


@router.get("/diagram/{node_id}")
async def get_one_line_diagram(
    node_id: str,
    depth: int = Query(2, ge=1, le=10, description="BFS radius downstream of selected node"),
    models: Optional[str] = Query(None, description="Comma-separated model IDs"),
):
    """Return the one-line diagram subgraph centred on node_id.

    Response shape
    --------------
    {
        "centre_id": str,
        "depth": int,
        "source_path": [str, ...],          # ordered [source_node, ..., centre]
        "nodes": [
            {
                "id": str,
                "name": str,
                "node_type": "Bus" | "Substation",
                "base_voltage_kv": float | null,
                "phases": [...],
                "attached_equipment": [...],
                "is_centre": bool,
                "node_role": "upstream" | "centre" | "downstream"
            },
            ...
        ],
        "edges": [
            {
                "id": str,
                "from_node_id": str,
                "to_node_id": str,
                "edge_type": str,
                "name": str,
                "phases": [...],
                "is_open": bool,
                "transformer_kva": float | null,
                "length_m": float | null
            },
            ...
        ]
    }
    """
    model_ids = get_active_model_ids(models)
    ensure_graph_built(model_ids)

    node_map, all_edges, G = _build_undirected_topology(model_ids)

    if node_id not in G:
        raise HTTPException(status_code=404, detail=f"Node '{node_id}' not found in topology.")

    # ── Upstream: full path from nearest EnergySource to selected node ────────
    source_path = _find_upstream_path(G, node_map, node_id)
    # All path nodes except the centre itself are "upstream"
    upstream_set: set[str] = set(source_path[:-1])
    logger.info("[diagram] source_path=%d  upstream_set=%d", len(source_path), len(upstream_set))

    # ── Downstream: depth-limited BFS from selected node ─────────────────────
    downstream_sub = nx.ego_graph(G, node_id, radius=depth)
    downstream_set: set[str] = set(downstream_sub.nodes()) - upstream_set - {node_id}
    logger.info("[diagram] ego_graph nodes=%d  downstream_set=%d  depth=%d  total_neighbors_of_centre=%d",
                len(downstream_sub.nodes()), len(downstream_set), depth, len(list(G.neighbors(node_id))))

    # ── Combined node set ─────────────────────────────────────────────────────
    all_node_ids = upstream_set | {node_id} | downstream_set

    # ── Filter edges to combined set ─────────────────────────────────────────
    sub_edges = [
        e for e in all_edges
        if e["from_node_id"] in all_node_ids and e["to_node_id"] in all_node_ids
    ]

    # ── Build response nodes ──────────────────────────────────────────────────
    response_nodes = []
    for nid in all_node_ids:
        raw = node_map.get(nid, {})
        if nid == node_id:
            role = "centre"
        elif nid in upstream_set:
            role = "upstream"
        else:
            role = "downstream"
        response_nodes.append({
            "id": nid,
            "name": raw.get("name") or nid,
            "node_type": raw.get("node_type", "Bus"),
            "base_voltage_kv": raw.get("base_voltage_kv"),
            "phases": raw.get("phases") or raw.get("phases_present") or ["A", "B", "C"],
            "attached_equipment": raw.get("attached_equipment", []),
            "is_centre": nid == node_id,
            "node_role": role,
        })

    # ── Build response edges ──────────────────────────────────────────────────
    response_edges = []
    for e in sub_edges:
        response_edges.append({
            "id": e.get("edge_id"),
            "from_node_id": e["from_node_id"],
            "to_node_id": e["to_node_id"],
            "edge_type": e.get("edge_type", "Unknown"),
            "name": e.get("name", ""),
            "phases": e.get("phases") or ["A", "B", "C"],
            "is_open": e.get("is_open", False),
            "transformer_kva": e.get("transformer_kva"),
            "length_m": e.get("length_m"),
        })

    return {
        "centre_id": node_id,
        "depth": depth,
        "source_path": source_path,
        "nodes": response_nodes,
        "edges": response_edges,
    }
