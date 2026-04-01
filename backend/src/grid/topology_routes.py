from fastapi import APIRouter, Query, HTTPException
from typing import Optional
from src.shared.dependencies import registry, graph_engine, ensure_graph_built, get_active_model_ids
from src.discovery.discover_downstream import DiscoverDownstreamUseCase
from src.discovery.trace_upstream import TraceUpstreamUseCase

router = APIRouter(prefix="/api/graph", tags=["grid"])

# Use cases
downstream_uc = DiscoverDownstreamUseCase(graph_engine)
upstream_uc = TraceUpstreamUseCase(graph_engine)

@router.get("/topology")
async def get_topology(
    models: Optional[str] = Query(None, description="Comma-separated model IDs (default: all active)")
):
    """Returns the full grid topology with coordinates for UI rendering."""
    model_ids = get_active_model_ids(models)
    ensure_graph_built(model_ids)

    nodes, all_edges = registry.get_combined_topology(model_ids)

    # Assign circuit IDs via connected components
    substations = [n['node_id'] for n in nodes if n['node_type'] == 'Substation']
    node_to_circuit = {}

    components = graph_engine.get_connected_components()

    node_to_comp_idx = {}
    for idx, comp in enumerate(components):
        for node in comp:
            node_to_comp_idx[node] = idx

    comp_to_circuit = {}
    for i, sub_id in enumerate(substations):
        if sub_id in node_to_comp_idx:
            comp_to_circuit[node_to_comp_idx[sub_id]] = f"circuit_{i+1}"

    for comp_idx, circuit_id in comp_to_circuit.items():
        for node in components[comp_idx]:
            node_to_circuit[node] = circuit_id

    # Attach coordinates and classify
    node_coords = {
        n['node_id']: [n['longitude'], n['latitude']]
        for n in nodes if n['longitude'] and n['latitude']
    }

    mapped_nodes = []
    for n in nodes:
        has_coords = n['longitude'] is not None and n['latitude'] is not None
        pos = [n['longitude'], n['latitude']] if has_coords else [0, 0]
        mapped_nodes.append({
            "id": n['node_id'],
            "type": n['node_type'],
            "name": n['name'],
            "position": pos,
            "has_coords": has_coords,
            "circuit_id": node_to_circuit.get(n['node_id'], "unknown"),
            "phases": n.get('phases_present', ['A', 'B', 'C']),
            "base_voltage_kv": n.get('base_voltage_kv'),
            "attached_equipment": n.get('attached_equipment', []),
            "model_id": n.get('model_id', 'unknown'),
        })

    mapped_edges = []
    for e in all_edges:
        src = e['from_node_id']
        tgt = e['to_node_id']
        src_pos = node_coords.get(src)
        tgt_pos = node_coords.get(tgt)
        mapped_edges.append({
            "id": e.get('edge_id', f"{src}-{tgt}"),
            "source": src,
            "target": tgt,
            "sourcePosition": src_pos or [0, 0],
            "targetPosition": tgt_pos or [0, 0],
            "has_coords": src_pos is not None and tgt_pos is not None,
            "circuit_id": node_to_circuit.get(src, "unknown"),
            "phases": e.get('phases'),
            "edge_type": e.get('edge_type'),
            "name": e.get('name', ''),
            "is_open": e.get('is_open', False),
            "transformer_kva": e.get('transformer_kva'),
            "model_id": e.get('model_id', 'unknown'),
        })

    return {"nodes": mapped_nodes, "edges": mapped_edges}

@router.get("/downstream/{node_id}")
async def get_downstream(node_id: str):
    """Finds all downstream nodes."""
    ensure_graph_built()
    return {"downstream_nodes": downstream_uc.execute(node_id)}

@router.get("/upstream/{node_id}")
async def get_upstream(node_id: str):
    """Finds all upstream nodes."""
    ensure_graph_built()
    return {"upstream_nodes": upstream_uc.execute(node_id)}
