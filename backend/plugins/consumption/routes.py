"""Consumption Analysis plugin — backend route.

Aggregates energy consumption time-series for downstream meters of the
selected nodes using the Plugin SDK (no direct DB connections).

Endpoints:
    GET /api/plugins/consumption/{node_ids}?start_time=&end_time=
    GET /api/plugins/consumption/{node_ids}/estimate?start_time=&end_time=
"""
from fastapi import APIRouter, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from plugins.sdk import sdk

router = APIRouter(prefix="/api/plugins/consumption", tags=["plugins"])


def _parse_ids(node_ids: str) -> list[str]:
    ids = [i.strip() for i in node_ids.split(",") if i.strip()]
    if not ids:
        raise HTTPException(status_code=400, detail="No node IDs provided")
    return ids


@router.get("/{node_ids}/estimate")
async def estimate_consumption(
    node_ids: str,
    start_time: str = Query(...),
    end_time: str = Query(...),
):
    """Return estimated row count for a consumption query without running it."""
    ids = _parse_ids(node_ids)
    return await run_in_threadpool(sdk.analytics.estimate_consumption, ids, start_time, end_time)


@router.get("/{node_ids}")
async def get_consumption(
    node_ids: str,
    start_time: str = Query(...),
    end_time: str = Query(...),
):
    """Return aggregate consumption time-series for the given nodes."""
    ids = _parse_ids(node_ids)
    return await run_in_threadpool(sdk.analytics.get_consumption, ids, start_time, end_time)
