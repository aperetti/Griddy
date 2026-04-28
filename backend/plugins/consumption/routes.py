"""Consumption Analysis plugin — backend route.

Aggregates energy consumption time-series for downstream meters of the
selected nodes using the Plugin SDK (no direct DB connections).

Endpoints:
    GET /api/plugins/consumption/{node_ids}?start_time=&end_time=[&force=]
    GET /api/plugins/consumption/{node_ids}/estimate?start_time=&end_time=
"""
import logging
import os
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from plugins.sdk import get_sdk
from src.shared.dependencies import ensure_graph_built, resolve_request_ids

router = APIRouter(prefix="/api/plugins/consumption", tags=["plugins"])
sdk = get_sdk("consumption")
logger = logging.getLogger(__name__)

MAX_NODE_IDS = 100
_DEFAULT_THRESHOLD = 2_000_000


def _parse_ids(node_ids: str) -> list[str]:
    ids = [i.strip() for i in node_ids.split(",") if i.strip()]
    if not ids:
        raise HTTPException(status_code=400, detail="No node IDs provided")
    if len(ids) > MAX_NODE_IDS:
        raise HTTPException(
            status_code=422,
            detail=f"Too many node IDs ({len(ids)}); maximum is {MAX_NODE_IDS}",
        )
    return ids


def _validate_datetimes(start_time: str, end_time: str) -> None:
    for name, value in (("start_time", start_time), ("end_time", end_time)):
        try:
            datetime.fromisoformat(value)
        except ValueError:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid {name}: must be ISO 8601 format (e.g. 2024-01-01T00:00:00)",
            )


@router.get("/{node_ids}/estimate")
async def estimate_consumption(
    node_ids: str,
    start_time: str = Query(...),
    end_time: str = Query(...),
):
    """Return estimated row count for a consumption query without running it."""
    ensure_graph_built()
    ids = _parse_ids(node_ids)
    resolved_ids = resolve_request_ids(ids)
    _validate_datetimes(start_time, end_time)
    try:
        return await run_in_threadpool(sdk.analytics.estimate_consumption, resolved_ids, start_time, end_time)
    except Exception as exc:
        logger.error("estimate_consumption failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/{node_ids}")
async def get_consumption(
    node_ids: str,
    start_time: str = Query(...),
    end_time: str = Query(...),
    force: bool = Query(False),
):
    """Return aggregate consumption time-series for the given nodes.

    Add ?force=true to bypass the row-count threshold (mirrors the frontend
    confirmation flow).  The threshold is read from the analytics_threshold
    config key (default 2 000 000).
    """
    ensure_graph_built()
    ids = _parse_ids(node_ids)
    resolved_ids = resolve_request_ids(ids)
    _validate_datetimes(start_time, end_time)

    if not force:
        try:
            est = await run_in_threadpool(sdk.analytics.estimate_consumption, resolved_ids, start_time, end_time)
        except Exception as exc:
            logger.error("consumption pre-check estimate failed: %s", exc)
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
        return await run_in_threadpool(sdk.analytics.get_consumption, resolved_ids, start_time, end_time)
    except Exception as exc:
        logger.error("get_consumption failed: %s", exc)
        raise HTTPException(status_code=500, detail="Analytics query failed")
