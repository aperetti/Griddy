"""Voltage Distribution plugin — backend route.

Calculates voltage distribution (KDE + heatmap + daily percentiles) for
downstream meters of the selected nodes using the Plugin SDK.

Endpoints:
    GET /api/plugins/voltage/{node_ids}?start_time=&end_time=[&degrees=]
    GET /api/plugins/voltage/{node_ids}/estimate?start_time=&end_time=[&degrees=]
"""
from fastapi import APIRouter, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from typing import Optional
from plugins.sdk import sdk

router = APIRouter(prefix="/api/plugins/voltage", tags=["plugins"])


def _parse_ids(node_ids: str) -> list[str]:
    ids = [i.strip() for i in node_ids.split(",") if i.strip()]
    if not ids:
        raise HTTPException(status_code=400, detail="No node IDs provided")
    return ids


@router.get("/{node_ids}/estimate")
async def estimate_voltage(
    node_ids: str,
    start_time: str = Query(...),
    end_time: str = Query(...),
    degrees: Optional[int] = Query(None),
):
    """Return estimated row count for a voltage distribution query without running it."""
    ids = _parse_ids(node_ids)
    return await run_in_threadpool(sdk.analytics.estimate_voltage, ids, start_time, end_time, degrees)


@router.get("/{node_ids}")
async def get_voltage_distribution(
    node_ids: str,
    start_time: str = Query(...),
    end_time: str = Query(...),
    degrees: Optional[int] = Query(None),
):
    """Return voltage distribution (KDE, heatmap, timeseries) for the given nodes."""
    ids = _parse_ids(node_ids)
    return await run_in_threadpool(sdk.analytics.get_voltage_distribution, ids, start_time, end_time, degrees)
