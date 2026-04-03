from fastapi import APIRouter, Query, HTTPException
from backend.plugins.sdk import get_sdk
from typing import Any

router = APIRouter(prefix="/api/plugins/load_heatmap", tags=["plugins", "load_heatmap"])

@router.get("/estimate")
def estimate_load_heatmap(
    start_time: str = Query(..., description="ISO 8601 start time"), 
    end_time: str = Query(..., description="ISO 8601 end time"),
    agg: str = Query("mean", description="Aggregation method: min, max, median, mean"),
    node_id: str = Query(None, description="Optional node to trace downstream from")
):
    """Returns row count estimate for the load heatmap."""
    sdk = get_sdk("load_heatmap")
    return sdk.analytics.estimate_edge_load_map(agg, start_time, end_time, start_node_id=node_id)

@router.get("/map")
def get_load_heatmap(
    start_time: str = Query(..., description="ISO 8601 start time"), 
    end_time: str = Query(..., description="ISO 8601 end time"),
    agg: str = Query("mean", description="Aggregation method: min, max, median, mean"),
    node_id: str = Query(None, description="Optional node to trace downstream from")
):
    """Calculates average load summary for all edges."""
    sdk = get_sdk("load_heatmap")
    result = sdk.analytics.get_edge_load_map(agg, start_time, end_time, start_node_id=node_id)
    if "error" in result:
         raise HTTPException(status_code=400, detail=result["error"])
    return result
