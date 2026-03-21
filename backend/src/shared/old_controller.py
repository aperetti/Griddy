"""API Controller for the Analytical Agent and Graph Queries.

All topology data is served from the in-memory CIM-Graph FeederModels
managed by CimModelRegistry.  SQLite is retained only for alarms.
DuckDB + Parquet remain the analytics engine for time-series queries.
"""
from fastapi import APIRouter, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from typing import Optional

from src.shared.cim_registry import CimModelRegistry
from src.shared.sqlite_repository import SqliteRepository
from src.grid.networkx_engine import NetworkXEngine
from src.discovery.discover_downstream import DiscoverDownstreamUseCase
from src.discovery.trace_upstream import TraceUpstreamUseCase
from src.analytics.calculate_voltage import CalculateVoltageDistributionUseCase
from src.analytics.phase_balancing import PhaseBalancingUseCase
from src.analytics.calculate_consumption import CalculateAggregateConsumptionUseCase
from src.analytics.map_voltage import MapVoltageUseCase
from src.analytics.get_alarms import GetActiveAlarmsUseCase
from src.agent.translate_nl_to_sql import AgentQueryProcessor
from src.shared.database_setup import DB_PATH, PARQUET_DIR, SQLITE_PATH

router = APIRouter()


@router.get("/estimate-test-unique")
async def estimate_test_unique():
    return {"status": "ok", "message": "unique route works"}


# ── Core dependencies ─────────────────────────────────────────────
# CIM model registry (populated during FastAPI lifespan startup)
registry = CimModelRegistry.get_instance()

# SQLite is kept only for alarms (generated offline by a separate script)
alarm_repo = SqliteRepository(SQLITE_PATH)

graph_engine = NetworkXEngine()
_graph_built_for: set[str] = set()  # model_ids the graph was last built for


def _get_active_model_ids(models_param: Optional[str] = None) -> list[str]:
    """Parse the ?models= query param into a list of model IDs.

    * None / empty  → all active models
    * comma-separated string → specific models
    """
    if not models_param:
        return registry.get_active_model_ids()
    return [m.strip() for m in models_param.split(",") if m.strip()]


def _ensure_graph_built(model_ids: list[str] | None = None):
    """Build the NetworkX graph from the in-memory CIM models.

    Rebuilds automatically when the set of active models changes.
    """
    global _graph_built_for

    requested = set(model_ids) if model_ids else set(registry.get_active_model_ids())
    if requested == _graph_built_for:
        return

    from src.grid.graph_node import GraphNode

    nodes_raw, edges = registry.get_combined_topology(
        list(requested) if model_ids else None
    )

    nodes = [
        GraphNode(
            id=n["node_id"],
            type=n["node_type"],
            name=n["name"] or n["node_id"],
            phases=n.get("phases_present") or ["A", "B", "C"],
            latitude=n["latitude"],
            longitude=n["longitude"],
            attached_equipment=n.get("attached_equipment", []),
            base_voltage_kv=n.get("base_voltage_kv"),
        )
        for n in nodes_raw
    ]

    graph_engine.build_graph(nodes=nodes, edges=edges)
    _graph_built_for = requested


# ── Use cases (analytics still use DuckDB + Parquet) ──────────────
downstream_uc = DiscoverDownstreamUseCase(graph_engine)
upstream_uc = TraceUpstreamUseCase(graph_engine)
voltage_uc = CalculateVoltageDistributionUseCase(graph_engine, DB_PATH, PARQUET_DIR)
phase_uc = PhaseBalancingUseCase(graph_engine, DB_PATH, PARQUET_DIR)
consumption_uc = CalculateAggregateConsumptionUseCase(graph_engine, DB_PATH, PARQUET_DIR)
map_voltage_uc = MapVoltageUseCase(graph_engine, DB_PATH, PARQUET_DIR)
agent_processor = AgentQueryProcessor()

@router.get("/api/graph/downstream/{node_id}")
async def get_downstream(node_id: str):
    """Finds all downstream nodes."""
    _ensure_graph_built()
    return {"downstream_nodes": downstream_uc.execute(node_id)}

@router.get("/api/graph/upstream/{node_id}")
async def get_upstream(node_id: str):
    """Finds all upstream nodes."""
    _ensure_graph_built()
    return {"upstream_nodes": upstream_uc.execute(node_id)}

@router.get("/api/analytics/voltage/{node_id}/estimate")
async def get_voltage_estimate(
    node_id: str, 
    start_time: str = Query(..., description="ISO 8601 start time"), 
    end_time: str = Query(..., description="ISO 8601 end time"),
    degrees: int = Query(None, description="Degrees of separation for nearby node analysis")
):
    """Returns row count estimate for voltage distribution for one or more nodes (comma-separated)."""
    _ensure_graph_built()
    node_ids = node_id.split(",")
    return voltage_uc.estimate(node_ids, start_time, end_time, degrees=degrees)

@router.get("/api/analytics/voltage/{node_id}")
async def get_voltage_distribution(
    node_id: str, 
    start_time: str = Query(..., description="ISO 8601 start time"), 
    end_time: str = Query(..., description="ISO 8601 end time"),
    degrees: int = Query(None, description="Degrees of separation for nearby node analysis")
):
    """Calculates voltage distribution downstream of one or more nodes (comma-separated)."""
    _ensure_graph_built()
    node_ids = node_id.split(",")
    result = voltage_uc.execute(node_ids, start_time, end_time, degrees=degrees)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result

@router.get("/api/analytics/phase-balance/{node_id}")
async def get_phase_balance(
    node_id: str, 
    start_time: str = Query(..., description="ISO 8601 start time"), 
    end_time: str = Query(..., description="ISO 8601 end time")
):
    """Calculates phase imbalance downstream of a node."""
    _ensure_graph_built()
    result = phase_uc.execute(node_id, start_time, end_time)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result

@router.get("/api/analytics/consumption/{node_id}/estimate")
async def get_consumption_estimate(
    node_id: str, 
    start_time: str = Query(..., description="ISO 8601 start time"), 
    end_time: str = Query(..., description="ISO 8601 end time")
):
    """Returns row count estimate for consumption aggregation for one or more nodes (comma-separated)."""
    _ensure_graph_built()
    node_ids = node_id.split(",")
    return consumption_uc.estimate(node_ids, start_time, end_time)

@router.get("/api/analytics/consumption/{node_id}")
async def get_consumption(
    node_id: str, 
    start_time: str = Query(..., description="ISO 8601 start time"), 
    end_time: str = Query(..., description="ISO 8601 end time")
):
    """Calculates aggregate consumption for one or more nodes (comma-separated)."""
    _ensure_graph_built()
    node_ids = node_id.split(",")
    result = consumption_uc.execute(node_ids, start_time, end_time)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result

@router.get("/api/analytics/map-voltage/estimate")
async def get_map_voltage_estimate(
    start_time: str = Query(..., description="ISO 8601 start time"), 
    end_time: str = Query(..., description="ISO 8601 end time"),
    agg: str = Query("median", description="Aggregation method: min, max, median, mean"),
    node_id: str = Query(None, description="Optional node to trace downstream from")
):
    """Returns row count estimate for map voltage summary."""
    _ensure_graph_built()
    return map_voltage_uc.estimate(start_time, end_time, agg, node_id)

@router.get("/api/analytics/map-voltage")
async def get_map_voltage(
    start_time: str = Query(..., description="ISO 8601 start time"), 
    end_time: str = Query(..., description="ISO 8601 end time"),
    agg: str = Query("median", description="Aggregation method: min, max, median, mean"),
    node_id: str = Query(None, description="Optional node to trace downstream from")
):
    """Calculates node voltage summary for the entire map or a subset."""
    _ensure_graph_built()
    result = await run_in_threadpool(map_voltage_uc.execute, start_time, end_time, agg, node_id)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result

@router.post("/api/agent/query")
async def process_agent_query(query: str):
    """Translates NL to SQL or Graph queries."""
    # In a real app we'd get context based on currently selected nodes
    result = agent_processor.process_query(query)
    return {"generated_prompt": result}

@router.get("/api/graph/topology")
async def get_topology(
    models: Optional[str] = Query(None, description="Comma-separated model IDs (default: all active)")
):
    """Returns the full grid topology with coordinates for UI rendering.

    Supports loading from one, many, or all in-memory CIM-Graph models.
    Pass ?models=IEEE8500 or ?models=IEEE8500,IEEE8500_3subs to filter.
    """
    model_ids = _get_active_model_ids(models)
    _ensure_graph_built(model_ids)
    nodes, all_edges = registry.get_combined_topology(model_ids)

    # Trace circuits from Substations
    substations = [n['node_id'] for n in nodes if n['node_type'] == 'Substation']
    node_to_circuit = {}

    import networkx as nx
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

    # Attach source and target coordinates to the edges for Deck.gl LineLayer
    node_coords = {
        n['node_id']: [n['longitude'], n['latitude']]
        for n in nodes if n['longitude'] and n['latitude']
    }

    # Map into Deck.GL format with enriched CIM attributes
    mapped_nodes = []
    for n in nodes:
        # We include all nodes even if they lack coordinates so they are searchable/selectable.
        # Assets connected to non-geographic nodes will still trigger selection.
        has_coords = n['longitude'] is not None and n['latitude'] is not None
        pos = [n['longitude'], n['latitude']] if has_coords else [0,0]
        
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
        
        # We include the edge even if nodes lack coordinates, but LineLayer will only render if positions exist.
        src_pos = node_coords.get(src)
        tgt_pos = node_coords.get(tgt)
        
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
            "is_regulator": e.get('is_regulator', False),
            "model_id": e.get('model_id', 'unknown'),
        })

    return {"nodes": mapped_nodes, "edges": mapped_edges}


# ═══════════════════════════════════════════════════════════════════
# Model management endpoints
# ═══════════════════════════════════════════════════════════════════

@router.get("/api/models")
async def list_models():
    """List all discovered CIM models with their loaded status."""
    return registry.list_models()


@router.post("/api/models/{model_id}/load")
async def load_model(model_id: str):
    """Load a CIM model into memory by its ID."""
    global _graph_built_for
    try:
        registry.load_model(model_id)
        _graph_built_for = set()  # force graph rebuild
        mgr = registry.get_manager(model_id)
        return {
            "model_id": model_id,
            "loaded": True,
            "node_count": len(mgr.get_topology_nodes()) if mgr else 0,
            "edge_count": len(mgr.get_topology_edges()) if mgr else 0,
        }
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/api/models/{model_id}/unload")
async def unload_model(model_id: str):
    """Unload a CIM model, freeing memory."""
    global _graph_built_for
    if model_id not in registry.get_active_model_ids():
        raise HTTPException(status_code=404, detail=f"Model '{model_id}' is not loaded")
    if len(registry.get_active_model_ids()) <= 1:
        raise HTTPException(status_code=400, detail="Cannot unload the last active model")
    registry.unload_model(model_id)
    _graph_built_for = set()  # force graph rebuild
    return {"model_id": model_id, "loaded": False}


# ═══════════════════════════════════════════════════════════════════
# CIM Model endpoints – query the in-memory FeederModels directly
# ═══════════════════════════════════════════════════════════════════

def _find_manager_for_mrid(mrid: str):
    """Search all loaded models for an equipment mRID."""
    for mid, mgr in registry.get_managers():
        detail = mgr.get_equipment_detail(mrid)
        if detail is not None:
            detail["model_id"] = mid
            return detail
    return None


def _find_manager_for_node(node_id: str):
    """Search all loaded models for a connectivity node."""
    for mid, mgr in registry.get_managers():
        detail = mgr.get_node_cim_details(node_id)
        if detail is not None:
            detail["model_id"] = mid
            return detail
    return None


@router.get("/api/cim/classes")
async def get_cim_classes():
    """List all CIM classes loaded into memory with their object counts."""
    combined: dict[str, int] = {}
    for _mid, mgr in registry.get_managers():
        for cls_name, count in mgr.get_cim_classes().items():
            combined[cls_name] = combined.get(cls_name, 0) + count
    return dict(sorted(combined.items()))


@router.get("/api/cim/equipment-by-class/{class_name}")
async def get_equipment_by_class(class_name: str):
    """List all equipment objects of a given CIM class (e.g. ACLineSegment)."""
    items = []
    for mid, mgr in registry.get_managers():
        for item in mgr.get_all_equipment_by_class(class_name):
            item["model_id"] = mid
            items.append(item)
    if not items:
        raise HTTPException(status_code=404, detail=f"No objects found for class '{class_name}'")
    return {"class": class_name, "count": len(items), "items": items}


@router.get("/api/cim/equipment/{mrid}")
async def get_equipment_detail(mrid: str):
    """Full CIM detail for any equipment by mRID (impedances, ratings, windings, etc.)."""
    detail = _find_manager_for_mrid(mrid)
    if detail is None:
        raise HTTPException(status_code=404, detail=f"Equipment not found: {mrid}")
    return detail


@router.get("/api/cim/node/{node_id}")
async def get_node_cim_details(node_id: str):
    """Enriched CIM details for a connectivity node and all its connected equipment."""
    detail = _find_manager_for_node(node_id)
    if detail is None:
        raise HTTPException(status_code=404, detail=f"Connectivity node not found: {node_id}")
    return detail


@router.get("/api/cim/neighbors/{target_id}")
async def get_cim_neighbors(target_id: str):
    """Returns immediate graph neighbors for any CIM entity."""
    for mid, mgr in registry.get_managers():
        neighbors = mgr.get_neighbors(target_id)
        if neighbors:
            neighbors["model_id"] = mid
            return neighbors
    raise HTTPException(status_code=404, detail=f"CIM entity not found: {target_id}")


@router.get("/api/cim/search")
async def search_cim(query: str = Query(..., min_length=2)):
    """Search across all loaded models for nodes matching the query."""
    return registry.search_all_models(query)


@router.get("/discovery/alarms/{node_id}")
async def get_node_alarms(node_id: str, include_downstream: bool = Query(True)):
    """Fetch active alarms for a node and optionally its downstream children."""
    use_case = GetActiveAlarmsUseCase(alarm_repo, graph_engine)
    alarms = use_case.execute(node_id, include_downstream)
    return [a.dict() for a in alarms]
