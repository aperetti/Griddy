import os
from fastapi import APIRouter, HTTPException
from src.shared.dependencies import registry

router = APIRouter(prefix="/api/feeders", tags=["feeders"])


@router.get("")
async def list_feeders():
    """List all discovered CIM feeders with their loaded status."""
    return registry.list_models()


@router.get("/resolve-node/{node_id}")
async def resolve_node(node_id: str):
    """Resolve a node ID to its containing feeder ID."""
    feeder_id = registry.resolve_node_to_model(node_id)
    if not feeder_id:
        raise HTTPException(
            status_code=404, 
            detail=f"Node '{node_id}' could not be resolved to a feeder"
        )
    return {"node_id": node_id, "feeder_id": feeder_id}


@router.post("/{feeder_id}/load")
async def load_feeder(feeder_id: str):
    """Load a CIM feeder into memory by its ID."""
    import src.shared.dependencies as deps
    try:
        registry.load_model(feeder_id)
        deps._graph_built_for = set()

        mgr = registry.get_manager(feeder_id)
        return {
            "feeder_id": feeder_id,
            "loaded": True,
            "node_count": len(mgr.get_topology_nodes()) if mgr else 0,
            "edge_count": len(mgr.get_topology_edges()) if mgr else 0,
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{feeder_id}/unload")
async def unload_feeder(feeder_id: str):
    """Unload a CIM feeder, freeing memory."""
    if feeder_id not in registry.get_active_model_ids():
        raise HTTPException(status_code=404, detail=f"Feeder '{feeder_id}' is not loaded")
    if len(registry.get_active_model_ids()) <= 1:
        raise HTTPException(status_code=400, detail="Cannot unload the last active feeder")

    registry.unload_model(feeder_id)
    import src.shared.dependencies as deps
    deps._graph_built_for = set()

    return {"feeder_id": feeder_id, "loaded": False}


@router.get("/neo4j-debug")
async def neo4j_debug():
    """Diagnostic: confirm Neo4j connectivity and show top labels + sample mRIDs."""
    neo4j_url = os.getenv("CIMG_URL")
    if not neo4j_url:
        return {"error": "CIMG_URL not set", "labels": [], "sample": []}

    username = os.getenv("CIMG_USERNAME", "neo4j")
    password = os.getenv("CIMG_PASSWORD", "")
    database = os.getenv("CIMG_DATABASE", "neo4j")

    from neo4j import GraphDatabase
    try:
        driver = GraphDatabase.driver(neo4j_url, auth=(username, password))
        with driver.session(database=database) as session:
            labels = [
                {"label": r["label"], "count": r["count"]}
                for r in session.run(
                    "CALL db.labels() YIELD label "
                    "CALL { WITH label MATCH (n) WHERE label IN labels(n) RETURN count(n) AS count } "
                    "RETURN label, count ORDER BY count DESC LIMIT 30"
                )
            ]
            sample = [
                dict(r) for r in session.run(
                    "MATCH (n) WHERE any(lbl IN labels(n) WHERE lbl IN ['PowerTransformer','Transformer']) "
                    "RETURN labels(n) AS lbls, n.`IdentifiedObject.mRID` AS mrid LIMIT 5"
                )
            ]
        driver.close()
        return {
            "url": neo4j_url,
            "database": database,
            "labels": labels,
            "power_transformer_sample": sample,
        }
    except Exception as e:
        return {"error": str(e), "url": neo4j_url, "database": database}
