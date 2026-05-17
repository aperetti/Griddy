from fastapi import APIRouter, Query, HTTPException
from typing import Optional
import logging
from src.shared.dependencies import registry, graph_engine, ensure_graph_built, get_active_model_ids, topology_repo
from src.discovery.discover_downstream import DiscoverDownstreamUseCase
from src.discovery.trace_upstream import TraceUpstreamUseCase

router = APIRouter(prefix="/api/graph", tags=["grid"])
logger = logging.getLogger(__name__)

# Use cases
downstream_uc = DiscoverDownstreamUseCase(graph_engine)
upstream_uc = TraceUpstreamUseCase(graph_engine)

@router.get("/topology")
async def get_topology(
    models: Optional[str] = Query(None, description="Comma-separated model IDs (default: all active)")
):
    """Returns the full grid topology with coordinates for UI rendering."""
    model_ids = get_active_model_ids(models)
    logger.info("Topology requested for models: %s", model_ids)
    
    # 1. Ensure the in-memory graph engine is hydrated
    ensure_graph_built(model_ids)

    # 2. Delegate retrieval and mapping to the repository
    try:
        result = topology_repo.get_mapped_topology(model_ids)
        logger.info("Topology mapped: %d nodes, %d edges", len(result["nodes"]), len(result["edges"]))
        return result
    except Exception as e:
        logger.error("Failed to retrieve/map topology: %s", e)
        raise HTTPException(status_code=500, detail="Internal error during topology mapping")

@router.get("/downstream/{node_id}")
async def get_downstream(node_id: str):
    """Finds all downstream nodes."""
    logger.info("Trace downstream requested for node %s", node_id)
    ensure_graph_built()
    result = downstream_uc.execute(node_id)
    logger.debug("Trace downstream found %d nodes", len(result))
    return {"downstream_nodes": result}

@router.get("/upstream/{node_id}")
async def get_upstream(node_id: str):
    """Finds all upstream nodes."""
    logger.info("Trace upstream requested for node %s", node_id)
    ensure_graph_built()
    result = upstream_uc.execute(node_id)
    logger.debug("Trace upstream found %d nodes", len(result))
    return {"upstream_nodes": result}
