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

import networkx as nx

from src.shared.dependencies import (
    registry,
    ensure_graph_built,
    get_active_model_ids,
    graph_engine,
)

router = APIRouter(prefix="/api/plugins/one-line-explorer", tags=["one_line_explorer"])


def _find_upstream_path(G: nx.Graph, node_map: dict, node_id: str) -> list[str]:
    """Return the ordered path [feeder_head, ..., node_id] tracing back to the source.

    Strategy
    --------
    1. Quick-exit — if the topology engine already knows this node IS the feeder
       head (flow_depth == 0), return immediately.

    2. Primary — always call ``graph_engine.find_upstream(node_id)`` regardless
       of whether flow_depth is populated.
       * When flow_depth IS populated: undirected BFS filtered by depth so that
         stitch connections and mis-oriented edges are handled gracefully.
       * When flow_depth is EMPTY (no EnergySource / Substation nodes found):
         directed-only BFS following reverse edges (load → source direction),
         which correctly traces upstream by CIM edge orientation alone.
       Results are sorted ascending by flow_depth when available; otherwise by
       descending undirected hop distance from the centre (nodes farther away
       are more upstream and should appear first).

    3. nx shortest-path fallback — used only when find_upstream returns empty.
       Searches from any Substation / EnergySource / flow_depth-0 node in the
       full undirected display graph (which includes even open switches, giving
       a complete topological picture).
    """
    flow_depth = graph_engine.flow_depth

    # ── 1. Quick-exit: selected node IS the feeder head ───────────────────
    if flow_depth.get(node_id) == 0:
        return [node_id]

    # ── 2. Primary: topology engine upstream BFS ──────────────────────────
    # Works regardless of whether flow_depth is populated:
    #   - flow_depth available  → undirected BFS filtered by depth
    #   - flow_depth empty      → directed reverse-edge BFS (CIM orientation)
    upstream_set, _ = graph_engine.find_upstream(node_id)

    if upstream_set:
        if flow_depth:
            # Sort ascending by flow_depth → feeder head (depth 0) first
            ordered = sorted(upstream_set, key=lambda n: flow_depth.get(n, 0))
        else:
            # No flow_depth: farther hop distance from centre ≈ more upstream
            hop_dist = nx.single_source_shortest_path_length(G, node_id)
            ordered = sorted(upstream_set, key=lambda n: -hop_dist.get(n, 0))
        return ordered + [node_id]

    # ── 3. nx shortest-path fallback ──────────────────────────────────────
    # Last resort when find_upstream returns nothing.  Also accepts
    # flow_depth-0 nodes as feeder heads even when not typed as Substation.
    source_nodes = [
        nid for nid, n in node_map.items()
        if nid in G and nid != node_id and (
            n.get("node_type") == "Substation"
            or any(eq.get("type") == "EnergySource" for eq in n.get("attached_equipment", []))
            or flow_depth.get(nid) == 0
        )
    ]

    best: list[str] | None = None
    for src in source_nodes:
        if not nx.has_path(G, src, node_id):
            continue
        p = nx.shortest_path(G, src, node_id)
        if best is None or len(p) < len(best):
            best = p

    return best if best is not None else [node_id]


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

    # ── Downstream: depth-limited BFS from selected node ─────────────────────
    downstream_sub = nx.ego_graph(G, node_id, radius=depth)
    downstream_set: set[str] = set(downstream_sub.nodes()) - upstream_set - {node_id}

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
