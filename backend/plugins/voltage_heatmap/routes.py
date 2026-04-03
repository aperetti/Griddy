"""Voltage Heat Map plugin — backend route.

Calculates aggregated voltage distributions across the map using the Plugin SDK.
"""
import logging
import os
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from plugins.sdk import get_sdk
from src.shared.dependencies import ensure_graph_built

router = APIRouter(prefix="/api/plugins/voltage_heatmap", tags=["plugins"])
sdk = get_sdk("voltage_heatmap")
logger = logging.getLogger(__name__)

_DEFAULT_THRESHOLD = 5_000_000  # Map queries can be larger


def _validate_datetimes(start_time: str, end_time: str) -> None:
    for name, value in (("start_time", start_time), ("end_time", end_time)):
        try:
            datetime.fromisoformat(value)
        except ValueError:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid {name}: must be ISO 8601 format (e.g. 2024-01-01T00:00:00)",
            )


@router.get("/estimate")
@router.get("/{node_id}/estimate")
async def estimate_voltage_map(
    node_id: Optional[str] = None,
    start_time: str = Query(...),
    end_time: str = Query(...),
    agg: str = Query("avg", enum=["avg", "min", "max", "median"]),
):
    """Return estimated row count for a voltage map query."""
    ensure_graph_built()
    _validate_datetimes(start_time, end_time)
    try:
        return await run_in_threadpool(
            sdk.analytics.estimate_voltage_map, agg, start_time, end_time, start_node_id=node_id
        )
    except Exception as exc:
        logger.error("estimate_voltage_map failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("")
@router.get("/{node_id}")
async def get_voltage_map(
    node_id: Optional[str] = None,
    start_time: str = Query(...),
    end_time: str = Query(...),
    agg: str = Query("avg", enum=["avg", "min", "max", "median"]),
    force: bool = Query(False),
):
    """Return voltage aggregations for map visualization."""
    ensure_graph_built()
    _validate_datetimes(start_time, end_time)

    if not force:
        try:
            est = await run_in_threadpool(
                sdk.analytics.estimate_voltage_map, agg, start_time, end_time, start_node_id=node_id
            )
        except Exception as exc:
            logger.error("voltage map pre-check estimate failed: %s", exc)
            raise HTTPException(status_code=500, detail="Analytics estimate failed")

        threshold = int(os.environ.get("analytics_threshold", str(_DEFAULT_THRESHOLD)))
        estimated = est.get("estimated_rows", 0)
        if estimated > threshold:
            raise HTTPException(
                status_code=429,
                detail=(
                    f"Query would process {estimated:,} rows, exceeding the configured "
                    f"threshold of {threshold:,}. Add ?force=true to proceed."
                ),
            )

    try:
        return await run_in_threadpool(
            sdk.analytics.get_voltage_map, agg, start_time, end_time, start_node_id=node_id
        )
    except Exception as exc:
        logger.error("get_voltage_map failed: %s", exc)
        raise HTTPException(status_code=500, detail="Analytics query failed")
