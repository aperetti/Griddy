import os
from fastapi import APIRouter, HTTPException
from src.shared.dependencies import registry

router = APIRouter(prefix="/api/models", tags=["models"])


@router.get("/neo4j-debug")
async def neo4j_debug():
    """Diagnostic: confirm Neo4j connectivity and show top labels + sample mRIDs."""
    neo4j_url = os.getenv("CIMG_URL")
    if not neo4j_url:
        return {"error": "CIMG_URL not set", "labels": [], "sample": []}

    username = os.getenv("CIMG_USERNAME", "neo4j")
    password = os.getenv("CIMG_PASSWORD", "")
    database = os.getenv("CIMG_NEO4J_DATABASE", "neo4j")

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

@router.get("")
async def list_models():
    """List all discovered CIM models with their loaded status."""
    models = registry.list_models()
    # Debug: Print models if empty
    if not models:
        print("DEBUG: No models discovered in registry.list_models()")
    return models

@router.post("/{model_id}/load")
async def load_model(model_id: str):
    """Load a CIM model into memory by its ID."""
    from src.shared.dependencies import _graph_built_for
    try:
        registry.load_model(model_id)
        # Clear graph tracker to force rebuild
        import src.shared.dependencies as deps
        deps._graph_built_for = set()
        
        mgr = registry.get_manager(model_id)
        return {
            "model_id": model_id,
            "loaded": True,
            "node_count": len(mgr.get_topology_nodes()) if mgr else 0,
            "edge_count": len(mgr.get_topology_edges()) if mgr else 0,
        }
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/{model_id}/unload")
async def unload_model(model_id: str):
    """Unload a CIM model, freeing memory."""
    if model_id not in registry.get_active_model_ids():
        raise HTTPException(status_code=404, detail=f"Model '{model_id}' is not loaded")
    if len(registry.get_active_model_ids()) <= 1:
        raise HTTPException(status_code=400, detail="Cannot unload the last active model")
    
    registry.unload_model(model_id)
    # Clear graph tracker to force rebuild
    import src.shared.dependencies as deps
    deps._graph_built_for = set()
    
    return {"model_id": model_id, "loaded": False}
