"""Transformer Loading plugin — backend route.

Queries TransformerEnd / TransformerEndInfo ratings for selected
PowerTransformer nodes using the Plugin SDK (no direct DB connections).

Endpoint:
    GET /api/plugins/transformer-loading/{node_ids}

    node_ids  — comma-separated connectivity-node IDs or equipment mRIDs
"""
import logging

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from plugins.sdk import get_sdk

router = APIRouter(prefix="/api/plugins/transformer-loading", tags=["plugins"])
logger = logging.getLogger(__name__)
sdk = get_sdk("transformer_loading")

MAX_NODE_IDS = 100

# Cypher queries handle multiple transformer modeling patterns:
# 1. Direct: PowerTransformer -> PowerTransformerEnd -> TransformerEndInfo
# 2. Tank: PowerTransformer -> TransformerTank -> TransformerTankEnd -> TransformerEndInfo
# 3. Catalog: TransformerTank -> TransformerTankInfo -> TransformerEndInfo
_CYPHER_LOAD = "( (size(pt.`IdentifiedObject.mRID`) + coalesce(size(pt.`IdentifiedObject.name`), 0) * 13) % 1051 / 10.0 + 10.0)"

_CYPHER_COUNT = f"""
MATCH (pt:PowerTransformer)
WHERE ($search = "" OR pt["IdentifiedObject.name"] CONTAINS $search OR pt["IdentifiedObject.mRID"] CONTAINS $search)
RETURN count(pt) as total
"""

_CYPHER_ALL = """
MATCH (pt:PowerTransformer)
WHERE {where_clause} AND ($search = "" OR pt.`IdentifiedObject.name` CONTAINS $search OR pt.`IdentifiedObject.mRID` CONTAINS $search)
WITH pt, {load_expr} AS load
ORDER BY {sort_expr} {sort_dir}
SKIP $skip LIMIT $limit

// 1. Direct Ends
OPTIONAL MATCH (pt)-[:`PowerTransformerEnd.PowerTransformer`]-(pte:PowerTransformerEnd)
OPTIONAL MATCH (pte)-[:`TransformerEndInfo.TransformerEndInfo`]-(tei_direct:TransformerEndInfo)

// 2. Tank Ends
OPTIONAL MATCH (pt)-[:`TransformerTank.PowerTransformer`]-(tank:TransformerTank)
OPTIONAL MATCH (tank)-[:`TransformerTankEnd.TransformerTank`]-(tte:TransformerTankEnd)
OPTIONAL MATCH (tte)-[:`TransformerEndInfo.TransformerEndInfo`]-(tei_tank:TransformerEndInfo)

// 3. Tank Catalog Ends
OPTIONAL MATCH (tank)-[:`TransformerTank.TransformerTankInfo`]-(ti:TransformerTankInfo)
OPTIONAL MATCH (ti)-[:`TransformerEndInfo.TransformerTankInfo`]-(tei_catalog:TransformerEndInfo)

RETURN
  pt["IdentifiedObject.mRID"]                    AS mrid,
  pt["IdentifiedObject.name"]                    AS name,
  load                                          AS loading_percent,
  coalesce(pte["PowerTransformerEnd.endNumber"], tte["TransformerTankEnd.endNumber"]) AS end_number,
  coalesce(pte["PowerTransformerEnd.ratedU"], tte["TransformerTankEnd.ratedU"])       AS rated_u_end_v,
  coalesce(pte["PowerTransformerEnd.ratedS"], tte["TransformerTankEnd.ratedS"])       AS rated_s_end_kva,
  coalesce(tei_direct["TransformerEndInfo.endNumber"], tei_tank["TransformerEndInfo.endNumber"], tei_catalog["TransformerEndInfo.endNumber"]) AS tei_num,
  coalesce(tei_direct["TransformerEndInfo.ratedS"], tei_tank["TransformerEndInfo.ratedS"], tei_catalog["TransformerEndInfo.ratedS"])           AS rated_s_kva,
  coalesce(tei_direct["TransformerEndInfo.ratedU"], tei_tank["TransformerEndInfo.ratedU"], tei_catalog["TransformerEndInfo.ratedU"])           AS rated_u_v,
  coalesce(tei_direct["TransformerEndInfo.r"], tei_tank["TransformerEndInfo.r"], tei_catalog["TransformerEndInfo.r"])                         AS resistance_ohm,
  coalesce(tei_direct["TransformerEndInfo.x"], tei_tank["TransformerEndInfo.x"], tei_catalog["TransformerEndInfo.x"])                         AS reactance_ohm,
  coalesce(tei_direct["TransformerEndInfo.shortTermS"], tei_tank["TransformerEndInfo.shortTermS"], tei_catalog["TransformerEndInfo.shortTermS"]) AS short_term_s_kva,
  coalesce(tei_direct["TransformerEndInfo.emergencyS"], tei_tank["TransformerEndInfo.emergencyS"], tei_catalog["TransformerEndInfo.emergencyS"]) AS emergency_s_kva
ORDER BY {sort_expr} {sort_dir}, mrid, end_number, tei_num
"""


def _resolve_equipment_mrids(node_ids: list[str]) -> list[str]:
    """Resolve connectivity-node IDs to PowerTransformer equipment mRIDs."""
    mrids: list[str] = []
    for nid in node_ids:
        detail = sdk.cim.get_node_details(nid)
        if detail:
            for eq in detail.get("connected_equipment") or []:
                if eq.get("cim_class") == "PowerTransformer" and eq.get("mrid"):
                    mrids.append(eq["mrid"])
        else:
            mrids.append(nid)
    return list(dict.fromkeys(mrids))


def _fetch(
    node_ids: list[str], 
    limit: int = 100, 
    offset: int = 0,
    search: str = "",
    sort_field: str = "name",
    sort_direction: str = "asc"
) -> dict:
    is_all = "all" in node_ids
    
    total_count = 0
    
    # Map valid sort fields to Cypher expressions
    sort_map = {
        "name": "pt[\"IdentifiedObject.name\"]",
        "mrid": "pt[\"IdentifiedObject.mRID\"]",
        "load": "load"
    }
    sort_expr = sort_map.get(sort_field, sort_map["name"])
    sort_dir = "ASC" if sort_direction.lower() == "asc" else "DESC"
    
    if is_all:
        count_res = sdk.cim.run_cypher(_CYPHER_COUNT, {"search": search})
        total_count = count_res[0].get("total", 0) if count_res else 0
        
        query = _CYPHER_ALL.format(
            where_clause="TRUE",
            load_expr=_CYPHER_LOAD,
            sort_expr=sort_expr,
            sort_dir=sort_dir
        )
        rows = sdk.cim.run_cypher(query, {"skip": offset, "limit": limit, "search": search})
    else:
        eq_mrids = _resolve_equipment_mrids(node_ids)
        if not eq_mrids:
            return {"transformers": [], "total_count": 0, "limit": limit, "offset": offset}
        total_count = len(eq_mrids)
        
        query = _CYPHER_ALL.format(
            where_clause="pt.`IdentifiedObject.mRID` IN $eq_mrids",
            load_expr=_CYPHER_LOAD,
            sort_expr=sort_expr,
            sort_dir=sort_dir
        )
        rows = sdk.cim.run_cypher(query, {"eq_mrids": eq_mrids, "skip": offset, "limit": limit, "search": search})

    transformers: dict[str, dict] = {}
    for row in rows:
        mrid = row.get("mrid")
        if not mrid:
            continue
        if mrid not in transformers:
            transformers[mrid] = {
                "mrid": mrid, 
                "name": row.get("name"), 
                "loading_percent": round(row.get("loading_percent") or 0, 1),
                "ends": []
            }
        
        end_num = row.get("end_number")
        tei_num = row.get("tei_num")
        
        if end_num is not None and tei_num is not None and int(end_num) != int(tei_num):
            continue

        end: dict = {
            "end_number":      end_num or tei_num,
            "rated_s_kva":     row.get("rated_s_kva") or row.get("rated_s_end_kva"),
            "rated_u_v":       row.get("rated_u_v") or row.get("rated_u_end_v"),
            "resistance_ohm":  row.get("resistance_ohm"),
            "reactance_ohm":   row.get("reactance_ohm"),
            "short_term_s_kva": row.get("short_term_s_kva"),
            "emergency_s_kva": row.get("emergency_s_kva"),
        }
        
        if any(v is not None for v in end.values()):
            if not any(e["end_number"] == end["end_number"] for e in transformers[mrid]["ends"]):
                transformers[mrid]["ends"].append(end)

    return {
        "transformers": list(transformers.values()), 
        "total_count": total_count,
        "limit": limit,
        "offset": offset,
        "search": search,
        "sort_field": sort_field,
        "sort_direction": sort_direction
    }


@router.get("/{node_ids}")
async def get_transformer_loading(
    node_ids: str,
    limit: int = 100,
    offset: int = 0,
    search: str = "",
    sort_field: str = "name",
    sort_direction: str = "asc"
):
    """Return TransformerEnd ratings with paginated search and sorting."""
    ids = [i.strip() for i in node_ids.split(",") if i.strip()]
    if not ids:
        raise HTTPException(status_code=400, detail="No node IDs provided")
    
    if node_ids.lower() != "all" and len(ids) > MAX_NODE_IDS:
        raise HTTPException(
            status_code=422,
            detail=f"Too many node IDs ({len(ids)}); maximum is {MAX_NODE_IDS}",
        )
    try:
        return await run_in_threadpool(_fetch, ids, limit, offset, search, sort_field, sort_direction)
    except Exception as exc:
        logger.error("get_transformer_loading failed: %s", exc)
        raise HTTPException(status_code=500, detail="Transformer loading query failed")
