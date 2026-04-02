"""Plugin registry API endpoint.

GET /api/plugins/registry
    Returns every discovered plugin and whether it is currently enabled.
    The frontend uses this to decide which plugin buttons to show.
"""
from fastapi import APIRouter
from plugins import DISCOVERED_PLUGIN_NAMES, PLUGIN_MANIFESTS, is_plugin_enabled

router = APIRouter(prefix="/api/plugins", tags=["plugins"])


@router.get("/registry")
async def get_plugin_registry():
    """List all discovered plugins and their enabled status, description, and permissions."""
    results = []
    for name in DISCOVERED_PLUGIN_NAMES:
        manifest = PLUGIN_MANIFESTS.get(name, {})
        results.append({
            "name": name,
            "enabled": is_plugin_enabled(name),
            "description": manifest.get("description", ""),
            "permissions": manifest.get("permissions", [])
        })
    return results
