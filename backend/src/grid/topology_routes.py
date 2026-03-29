from fastapi import APIRouter, Query, HTTPException
from typing import Optional
import networkx as nx
from src.shared.dependencies import registry, graph_engine, display_engine, ensure_graph_built, get_active_model_ids
from src.grid.graph_node import GraphNode
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
    
    # Ensure rules are reloaded from the database to show live changes
    display_engine.load_rules()
    
    nodes, all_edges = registry.get_combined_topology(model_ids)

    # Trace circuits from Substations
    substations = [n['node_id'] for n in nodes if n['node_type'] == 'Substation']
    node_to_circuit = {}

    undirected_graph = graph_engine.graph.to_undirected()
    components = list(nx.connected_components(undirected_graph))
    
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

    # 1. Perform bulk classification for all active models
    # This delegates matching to the Neo4j engine
    all_classifications = {}
    for mid, mgr in registry.get_managers(model_ids):
        model_classifications = display_engine.classify_all(mgr)
        all_classifications.update(model_classifications)

    mapped_nodes = []
    for n in nodes:
        has_coords = n['longitude'] is not None and n['latitude'] is not None
        pos = [n['longitude'], n['latitude']] if has_coords else [0,0]
        
        # Determine classification for the node
        # A node inherits classification from its most important attached equipment
        classification = None
        for eq in n.get('attached_equipment', []):
            mrid = eq.get('mrid')
            if mrid in all_classifications:
                classification = all_classifications[mrid]
                break
        
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
            "display_type": classification.get('visual_type') if classification else None,
            "display_icon": (
                f"rule_{classification.get('rule_id')}_{classification.get('override_hash')}" if classification and classification.get('rule_id') and classification.get('override_hash')
                else f"rule_{classification.get('rule_id')}" if classification and classification.get('rule_id')
                else None
            ),
            "display_color": classification.get('color_hex') if classification else None,
            "display_size": float(classification.get('size', 1.0)) if classification else 1.0,
            "display_label": classification.get('label') if classification else None,
            "display_css": classification.get('display_css', '') if classification else '',
            "cluster_enabled": bool(classification.get('cluster_enabled', False)) if classification else False,
            "cluster_radius": float(classification.get('cluster_radius', 40.0)) if classification else 40.0,
            "cluster_max_zoom": float(classification.get('cluster_max_zoom', 20.0)) if classification else 20.0,
            "cluster_min_points": int(classification.get('cluster_min_points', 2)) if classification else 2,
            "display_min_zoom": float(classification.get('min_zoom', 0.0)) if classification else 0.0,
            "display_max_zoom": float(classification.get('max_zoom', 24.0)) if classification else 24.0,
            "display_rotate_to_edge": bool(classification.get('rotate_to_edge', False)) if classification else False,
            "display_tooltip": classification.get('tooltip_config') if classification else None,
            "display_tooltip_overrides": classification.get('tooltip_overrides') if classification else None,
            "model_id": n.get('model_id', 'unknown'),
        })

    mapped_edges = []
    for e in all_edges:
        src = e['from_node_id']
        tgt = e['to_node_id']
        src_pos = node_coords.get(src)
        tgt_pos = node_coords.get(tgt)
        
        # Determine classification for the edge
        classification = all_classifications.get(e.get('edge_id'))
        
        mapped_edges.append({
            "id": e.get('edge_id', f"{src}-{tgt}"),
            "source": src,
            "target": tgt,
            "sourcePosition": src_pos or [0,0],
            "targetPosition": tgt_pos or [0,0],
            "has_coords": src_pos is not None and tgt_pos is not None,
            "circuit_id": node_to_circuit.get(src, "unknown"),
            "phases": e.get('phases'),
            "edge_type": e.get('edge_type'),
            "name": e.get('name', ''),
            "is_open": e.get('is_open', False),
            "transformer_kva": e.get('transformer_kva'),
            "display_type": classification.get('visual_type') if classification else None,
            "display_icon": (
                f"rule_{classification.get('rule_id')}_{classification.get('override_hash')}" if classification and classification.get('rule_id') and classification.get('override_hash')
                else f"rule_{classification.get('rule_id')}" if classification and classification.get('rule_id')
                else None
            ),
            "display_color": classification.get('color_hex') if classification else None,
            "display_size": float(classification.get('size', 1.0)) if classification else 1.0,
            "display_label": classification.get('label') if classification else None,
            "display_css": classification.get('display_css', '') if classification else '',
            "display_min_zoom": float(classification.get('min_zoom', 0.0)) if classification else 0.0,
            "display_max_zoom": float(classification.get('max_zoom', 24.0)) if classification else 24.0,
            "display_rotate_to_edge": bool(classification.get('rotate_to_edge', False)) if classification else False,
            "display_tooltip": classification.get('tooltip_config') if classification else None,
            "display_tooltip_overrides": classification.get('tooltip_overrides') if classification else None,
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
