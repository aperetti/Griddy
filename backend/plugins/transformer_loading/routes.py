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

# Cypher queries both the connectivity-node ID path and the direct mRID path
# so callers can pass either form without needing to know which they have.
_CYPHER = """
MATCH (pt:PowerTransformer)
WHERE pt.`IdentifiedObject.mRID` IN $eq_mrids
OPTIONAL MATCH (pt)--(pte:PowerTransformerEnd)
OPTIONAL MATCH (pte)--(tei:TransformerEndInfo)
RETURN
  pt.`IdentifiedObject.mRID`       AS mrid,
  pt.`IdentifiedObject.name`       AS name,
  pte.`PowerTransformerEnd.endNumber`          AS end_number,
  pte.`PowerTransformerEnd.ratedU`             AS rated_u_end_v,
  pte.`PowerTransformerEnd.ratedS`             AS rated_s_end_kva,
  tei.`TransformerEndInfo.ratedS`              AS rated_s_kva,
  tei.`TransformerEndInfo.ratedU`              AS rated_u_v,
  tei.`TransformerEndInfo.r`                   AS resistance_ohm,
  tei.`TransformerEndInfo.x`                   AS reactance_ohm,
  tei.`TransformerEndInfo.shortTermS`          AS short_term_s_kva,
  tei.`TransformerEndInfo.emergencyS`          AS emergency_s_kva
ORDER BY mrid, end_number
"""


def _resolve_equipment_mrids(node_ids: list[str]) -> list[str]:
    """Resolve connectivity-node IDs to PowerTransformer equipment mRIDs.

    If a node_id already looks like a UUID (equipment mRID), return it as-is.
    Otherwise, use sdk.cim.get_node_details to find attached transformers.
    """
    mrids: list[str] = []
    for nid in node_ids:
        detail = sdk.cim.get_node_details(nid)
        if detail:
            for eq in detail.get("connected_equipment") or []:
                if eq.get("cim_class") == "PowerTransformer" and eq.get("mrid"):
                    mrids.append(eq["mrid"])
        else:
            # Assume it's already an equipment mRID
            mrids.append(nid)
    return list(dict.fromkeys(mrids))  # deduplicate, preserve order


def _fetch(node_ids: list[str]) -> dict:
    eq_mrids = _resolve_equipment_mrids(node_ids)
    if not eq_mrids:
        return {"transformers": [], "count": 0}

    rows = sdk.cim.run_cypher(_CYPHER, {"eq_mrids": eq_mrids})

    transformers: dict[str, dict] = {}
    for row in rows:
        mrid = row.get("mrid")
        if not mrid:
            continue
        if mrid not in transformers:
            transformers[mrid] = {"mrid": mrid, "name": row.get("name"), "ends": []}
        end: dict = {
            "end_number":      row.get("end_number"),
            "rated_s_kva":     row.get("rated_s_kva") or row.get("rated_s_end_kva"),
            "rated_u_v":       row.get("rated_u_v") or row.get("rated_u_end_v"),
            "resistance_ohm":  row.get("resistance_ohm"),
            "reactance_ohm":   row.get("reactance_ohm"),
            "short_term_s_kva": row.get("short_term_s_kva"),
            "emergency_s_kva": row.get("emergency_s_kva"),
        }
        # Only add ends that have some data
        if any(v is not None for v in end.values()):
            transformers[mrid]["ends"].append(end)

    return {"transformers": list(transformers.values()), "count": len(transformers)}


@router.get("/{node_ids}")
async def get_transformer_loading(node_ids: str):
    """Return TransformerEnd ratings for the given node IDs or equipment mRIDs."""
    ids = [i.strip() for i in node_ids.split(",") if i.strip()]
    if not ids:
        raise HTTPException(status_code=400, detail="No node IDs provided")
    if len(ids) > MAX_NODE_IDS:
        raise HTTPException(
            status_code=422,
            detail=f"Too many node IDs ({len(ids)}); maximum is {MAX_NODE_IDS}",
        )
    try:
        return await run_in_threadpool(_fetch, ids)
    except Exception as exc:
        logger.error("get_transformer_loading failed: %s", exc)
        raise HTTPException(status_code=500, detail="Transformer loading query failed")
