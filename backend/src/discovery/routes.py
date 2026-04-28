import os
import re
import logging
from fastapi import APIRouter, Query, HTTPException, Depends
from fastapi.concurrency import run_in_threadpool
from src.shared.auth import get_current_username
from pydantic import BaseModel
from typing import Any, Dict, List
import sqlite3
from src.shared.dependencies import registry, ensure_graph_built, ADMIN_SQLITE_PATH

router = APIRouter(prefix="/api/cim", tags=["discovery"])
logger = logging.getLogger(__name__)


def _find_manager_for_mrid(mrid: str):
    """Search all loaded models for an equipment mRID."""
    logger.debug("Searching for mRID: %s", mrid)
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
    logger.info("Equipment detail requested for mRID: %s", mrid)
    detail = _find_manager_for_mrid(mrid)
    if detail is None:
        logger.warning("Equipment not found: %s", mrid)
        raise HTTPException(status_code=404, detail=f"Equipment not found: {mrid}")
    return detail


@router.get("/equipment/{mrid}/expanded")
async def get_equipment_detail_expanded(mrid: str):
    """Equipment detail with terminal connectivity nodes expanded to full objects for tooltip resolution."""
    logger.info("Expanded equipment detail requested for mRID: %s", mrid)

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
    query: str = Query(..., min_length=2),
    class_name: str | None = None,
    global_search: bool = False,
):
    """Search for nodes/equipment. global_search=true queries Neo4j directly across all feeders."""
    if global_search:
        return registry.search_neo4j_global(query, class_name=class_name)
    return registry.search_all_models(query, class_name=class_name)


@router.get("/schema")
async def get_cim_schema():
    """Return common CIM classes and their attributes."""
    ensure_graph_built()
    return registry.get_cim_schema()


@router.get("/conducting-equipment")
async def get_conducting_equipment_classes():
    """Return CIM classes that subclass ConductingEquipment (i.e. connect via Terminal)."""
    from src.shared.cim.profile import CimProfileService
    svc = CimProfileService.get_instance()
    return {"classes": svc.get_conducting_equipment_classes()}


@router.get("/rootable-classes")
async def get_rootable_classes():
    """Return CIM classes that can have a Location relationship (subclasses of PowerSystemResource)."""
    from src.shared.cim.profile import CimProfileService
    svc = CimProfileService.get_instance()
    return {"classes": svc.get_rootable_classes()}


@router.get("/adjacent-classes/{class_name}")
async def get_adjacent_classes(class_name: str):
    """Return CIM classes adjacent to class_name via UML associations.

    Filtered to topology-relevant classes (Equipment + ConnectivityNode + Terminal
    subclasses) to avoid noise from Measurement/Control/Location/AssetInfo types.
    """
    from src.shared.cim.profile import CimProfileService
    svc = CimProfileService.get_instance()

    adjacent = svc.get_adjacent_classes(class_name)

    # Filter to topology-relevant superclasses — excludes measurement, control,
    # and fault classes that are not useful path hops.
    _TOPOLOGY_ROOTS = frozenset({
        "Equipment", "ConductingEquipment", "ConnectivityNode", "Terminal",
        "BusNameMarker", "RegulatingControl", "TransformerEnd",
        "TapChanger", "Asset", "AssetInfo", "Location", "BaseVoltage",
    })
    
    # Priority for categorization (most specific to most general)
    _CATEGORIES = [
        ("ConductingEquipment", "Conducting Equipment"),
        ("TransformerEnd", "Transformer Ends"),
        ("TapChanger", "Tap Changers"),
        ("Terminal", "Topology"),
        ("ConnectivityNode", "Topology"),
        ("BusNameMarker", "Topology"),
        ("RegulatingControl", "Control & Regulation"),
        ("AssetInfo", "Asset Information"),
        ("Asset", "Assets"),
        ("Location", "Locations"),
        ("BaseVoltage", "System Metadata"),
        ("Equipment", "Other Equipment"),
    ]

    filtered: list[dict] = []
    for name in adjacent:
        cls = svc.classes.get(name)
        if not cls:
            continue
        mro_names = {c.__name__ for c in getattr(cls, "__mro__", [])}
        
        if not (mro_names & _TOPOLOGY_ROOTS):
            continue
            
        # Determine category based on MRO
        category = "Other CIM Classes"
        for root, label in _CATEGORIES:
            if root in mro_names:
                category = label
                break
        
        filtered.append({"name": name, "category": category})

    return {"class": class_name, "adjacent": sorted(filtered, key=lambda x: (x["category"], x["name"]))}


@router.get("/connections/{class_name}")
async def get_class_connections(class_name: str):
    """List all CIM classes that can be directly attached to the given class."""
    return {
        "class": class_name,
        "connected_classes": registry.get_class_connections(class_name),
    }


@router.get("/ami-adapters")
async def get_ami_adapters():
    """List all installed AMI data adapters."""
    from src.shared.meter_adapters.registry import discover_adapters
    return await run_in_threadpool(discover_adapters)


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
    logger.info("Executing Cypher query")
    if _WRITE_KEYWORDS.search(request.cypher):
        logger.warning("Rejected write-attempt Cypher query")
        raise HTTPException(
            status_code=400,
            detail="Only read-only Cypher queries are permitted.",
        )

    def _run() -> Dict[str, Any]:
        logger.debug("Cypher query: %s | Params: %s", request.cypher, request.params)
        
        from src.shared.dependencies import get_neo4j_driver
        driver = get_neo4j_driver()
        if not driver:
            raise HTTPException(
                status_code=503, detail="Neo4j driver not initialized (check CIMG_URL)."
            )

        neo4j_database = os.getenv("CIMG_DATABASE", "neo4j")

        try:
            with driver.session(database=neo4j_database) as session:
                def work(tx):
                    res = tx.run(request.cypher, **request.params)
                    return res.data(), res.keys() if hasattr(res, "keys") else None
                records, keys = session.execute_read(work)
                if not keys and records:
                    keys = list(records[0].keys())
                keys = keys or []
        except Exception as exc:
            logger.error("Neo4j query error: %s", exc)
            raise HTTPException(status_code=500, detail=f"Neo4j query error: {exc}")

        # Extract mRIDs if the query returned them
        mrids = [row.get('mrid') for row in records if isinstance(row, dict) and row.get('mrid')]
        
        return {"columns": keys, "rows": records, "count": len(records), "mrids": mrids}

    return await run_in_threadpool(_run)


# ── Config Overrides (Migrated from Node.js) ───────────────────────
class ConfigUpdate(BaseModel):
    key: str
    value: str


def _get_admin_conn():
    conn = sqlite3.connect(ADMIN_SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


@router.get("/config")
async def get_config_overrides():
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
