import os
import re
from fastapi import APIRouter, Query, HTTPException, Depends
from fastapi.concurrency import run_in_threadpool
from src.shared.auth import get_current_username
from pydantic import BaseModel
from typing import Any, Dict, List
import sqlite3
from src.shared.dependencies import registry, ensure_graph_built, ADMIN_SQLITE_PATH

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


@router.get("/equipment/{mrid}/expanded")
async def get_equipment_detail_expanded(mrid: str):
    """Equipment detail with terminal connectivity nodes expanded to full objects for tooltip resolution."""

    def _get():
        model_id = registry._mrid_to_model.get(mrid)
        if model_id:
            mgr = registry.get_manager(model_id)
            if mgr:
                detail = mgr.get_equipment_detail_expanded(mrid)
                if detail is not None:
                    detail["model_id"] = model_id
                    return detail
        for mid, mgr in registry.get_managers():
            detail = mgr.get_equipment_detail_expanded(mrid)
            if detail is not None:
                detail["model_id"] = mid
                return detail
        raise HTTPException(status_code=404, detail=f"Equipment not found: {mrid}")

    return await run_in_threadpool(_get)


@router.get("/node/{node_id}")
async def get_node_cim_details(node_id: str):
    """Enriched CIM details for a connectivity node."""
    detail = _find_manager_for_node(node_id)
    if detail is None:
        raise HTTPException(
            status_code=404, detail=f"Connectivity node not found: {node_id}"
        )
    return detail


@router.get("/properties/{mrid}")
async def get_cim_properties(mrid: str):
    """Fetch all properties of any CIM node directly from Neo4j by mRID.

    Fallback for node types not indexed in memory (Location, TransformerTankEnd, etc.).
    """
    for _mid, mgr in registry.get_managers():
        props = mgr.get_node_properties(mrid)
        if props is not None:
            return props
    raise HTTPException(status_code=404, detail=f"Node not found: {mrid}")


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


@router.get("/connections/{class_name}")
async def get_class_connections(class_name: str):
    """List all CIM classes that can be directly attached to the given class."""
    return {
        "class": class_name,
        "connected_classes": registry.get_class_connections(class_name),
    }


# ── Client-side Cypher execution ──────────────────────────────────

# Pattern of write keywords that must not appear in read-only queries.
# Checked against the full query string (case-insensitive, word boundaries).
_WRITE_KEYWORDS = re.compile(
    r"\b(CREATE|MERGE|SET|DELETE|DETACH|REMOVE|DROP|CALL\s+db\.)\b",
    re.IGNORECASE,
)


class CypherQueryRequest(BaseModel):
    cypher: str
    params: Dict[str, Any] = {}


@router.post("/query")
async def execute_cim_query(request: CypherQueryRequest):
    """Execute a pre-built read-only Cypher query against the CIM graph.

    The frontend uses @neo4j/cypher-builder to construct parameterized queries;
    this endpoint is the thin execution layer. Write operations are rejected.

    Returns: { columns: [...], rows: [{col: value, ...}], count: N }
    """
    if _WRITE_KEYWORDS.search(request.cypher):
        raise HTTPException(
            status_code=400,
            detail="Only read-only Cypher queries are permitted.",
        )

    def _run() -> Dict[str, Any]:
        neo4j_url = os.getenv("CIMG_URL")
        if not neo4j_url:
            raise HTTPException(
                status_code=503, detail="Neo4j URL (CIMG_URL) is not configured."
            )

        from neo4j import GraphDatabase

        neo4j_user = os.getenv("CIMG_USERNAME", "neo4j")
        neo4j_password = os.getenv("CIMG_PASSWORD", "")
        neo4j_database = os.getenv("CIMG_DATABASE", "neo4j")

        try:
            driver = GraphDatabase.driver(neo4j_url, auth=(neo4j_user, neo4j_password))
            with driver.session(database=neo4j_database) as session:
                result = session.run(request.cypher, **request.params)
                records = result.data()
                keys: List[str] = (
                    result.keys()
                    if hasattr(result, "keys")
                    else (list(records[0].keys()) if records else [])
                )
            driver.close()
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Neo4j query error: {exc}")

        return {"columns": keys, "rows": records, "count": len(records)}

    return await run_in_threadpool(_run)


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
