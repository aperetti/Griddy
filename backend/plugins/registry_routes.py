"""Plugin registry API endpoint.

GET /api/plugins/registry
    Returns every discovered plugin and whether it is currently enabled.
    The frontend uses this to decide which plugin buttons to show.
"""
from fastapi import APIRouter
from plugins import DISCOVERED_PLUGIN_NAMES, is_plugin_enabled

router = APIRouter(prefix="/api/plugins", tags=["plugins"])


@router.get("/registry")
async def get_plugin_registry():
    """List all discovered plugins and their enabled status."""
    return [
        {"name": name, "enabled": is_plugin_enabled(name)}
        for name in DISCOVERED_PLUGIN_NAMES
    ]
