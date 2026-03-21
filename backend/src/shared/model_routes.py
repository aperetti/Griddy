from fastapi import APIRouter, HTTPException
from src.shared.dependencies import registry

router = APIRouter(prefix="/api/models", tags=["models"])

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
