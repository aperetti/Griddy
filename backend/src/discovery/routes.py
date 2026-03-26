from fastapi import APIRouter, Query, HTTPException, Depends
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
import sqlite3
from src.shared.dependencies import registry, ensure_graph_built, ADMIN_SQLITE_PATH
from src.shared.auth import get_current_username

router = APIRouter(prefix="/api/cim", tags=["discovery"])


def _find_manager_for_mrid(mrid: str):
    """Search all loaded models for an equipment mRID."""
    model_id = registry._mrid_to_model.get(mrid)
    if model_id:
        mgr = registry.get_manager(model_id)
        if mgr:
            detail = mgr.get_equipment_detail(mrid)
            if detail is not None:
                detail["model_id"] = model_id
                return detail

    # Fallback: Search all active managers (robustness for GUIDs not in index)
    for mid, mgr in registry.get_managers():
        detail = mgr.get_equipment_detail(mrid)
        if detail is not None:
            detail["model_id"] = mid
            registry._mrid_to_model[mrid] = mid  # Self-heal index
            return detail

    return None


def _find_manager_for_node(node_id: str):
    """Search all loaded models for a connectivity node."""
    model_id = registry._node_to_model.get(node_id)
    if model_id:
        mgr = registry.get_manager(model_id)
        if mgr:
            detail = mgr.get_node_cim_details(node_id)
            if detail is not None:
                detail["model_id"] = model_id
                return detail

    # Fallback: Search all active managers
    for mid, mgr in registry.get_managers():
        detail = mgr.get_node_cim_details(node_id)
        if detail is not None:
            detail["model_id"] = mid
            registry._node_to_model[node_id] = mid  # Self-heal index
            return detail

    # Additional Fallback: Check if this was an equipment/edge ID (for Rule Assistant robustness)
    return _find_manager_for_mrid(node_id)


@router.get("/classes")
async def get_cim_classes():
    """List all CIM classes loaded into memory with their object counts."""
    combined: dict[str, int] = {}
    for _mid, mgr in registry.get_managers():
        for cls_name, count in mgr.get_cim_classes().items():
            combined[cls_name] = combined.get(cls_name, 0) + count
    return dict(sorted(combined.items()))


@router.get("/equipment-by-class/{class_name}")
async def get_equipment_by_class(class_name: str):
    """List all equipment objects of a given CIM class."""
    items = []
    for mid, mgr in registry.get_managers():
        for item in mgr.get_all_equipment_by_class(class_name):
            item["model_id"] = mid
            items.append(item)
    if not items:
        raise HTTPException(
            status_code=404, detail=f"No objects found for class '{class_name}'"
        )
    return {"class": class_name, "count": len(items), "items": items}


@router.get("/equipment/{mrid}")
async def get_equipment_detail(mrid: str):
    """Full CIM detail for any equipment by mRID."""
    detail = _find_manager_for_mrid(mrid)
    if detail is None:
        raise HTTPException(status_code=404, detail=f"Equipment not found: {mrid}")
    return detail


@router.get("/node/{node_id}")
async def get_node_cim_details(node_id: str):
    """Enriched CIM details for a connectivity node."""
    detail = _find_manager_for_node(node_id)
    if detail is None:
        raise HTTPException(
            status_code=404, detail=f"Connectivity node not found: {node_id}"
        )
    return detail


@router.get("/neighbors/{target_id}")
async def get_cim_neighbors(target_id: str):
    """Returns immediate graph neighbors for any CIM entity."""
    for mid, mgr in registry.get_managers():
        neighbors = mgr.get_neighbors(target_id)
        if neighbors:
            neighbors["model_id"] = mid
            return neighbors
    raise HTTPException(status_code=404, detail=f"CIM entity not found: {target_id}")


@router.get("/search")
async def search_cim(
    query: str = Query(..., min_length=2), class_name: str | None = None
):
    """Search across all loaded models for nodes matching the query."""
    return registry.search_all_models(query, class_name=class_name)


@router.get("/schema")
async def get_cim_schema():
    """Return common CIM classes and their attributes."""
    ensure_graph_built()
    return registry.get_cim_schema()


# ── Config Overrides (Migrated from Node.js) ───────────────────────
class ConfigUpdate(BaseModel):
    key: str
    value: str


def _get_admin_conn():
    conn = sqlite3.connect(ADMIN_SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


@router.get("/config", tags=["admin"])
async def get_config_overrides(username: str = Depends(get_current_username)):
    """Read all configuration overrides from the admin database."""

    def _get():
        with _get_admin_conn() as conn:
            return [
                dict(row)
                for row in conn.execute("SELECT * FROM config_overrides").fetchall()
            ]

    return await run_in_threadpool(_get)


@router.post("/config", tags=["admin"])
async def set_config_override(
    config: ConfigUpdate, username: str = Depends(get_current_username)
):
    """Set or update a configuration override."""

    def _set():
        with _get_admin_conn() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO config_overrides (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
                (config.key, config.value),
            )
            return {"success": True}

    return await run_in_threadpool(_set)
