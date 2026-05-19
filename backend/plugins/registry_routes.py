"""Plugin registry API endpoint.

GET /api/plugins/registry
    Returns every discovered plugin and whether it is currently enabled.
    The frontend uses this to decide which plugin buttons to show.
"""
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import FileResponse
from pathlib import Path
from plugins import DISCOVERED_PLUGIN_NAMES, PLUGIN_MANIFESTS, is_plugin_enabled, rescan_and_register, BUILTIN_PLUGINS_DIR, EXTERNAL_PLUGINS_DIR

router = APIRouter(prefix="/api/plugins", tags=["plugins"])


@router.get("/registry")
async def get_plugin_registry(request: Request):
...
    return results


@router.get("/assets/{path:path}")
async def get_plugin_asset(path: str):
    """Serve pre-compiled UI assets for all plugins (built-in and external).
    
    This route serves .js, .css, and .json files from the plugins directories.
    Path traversal is prevented.
    """
    # Allowed extensions for security
    ALLOWED_EXTENSIONS = {'.js', '.css', '.json', '.png', '.svg', '.map'}
    
    # 1. Resolve potential base directories
    search_dirs = [BUILTIN_PLUGINS_DIR, EXTERNAL_PLUGINS_DIR]
    
    # Clean and validate path
    # Example paths: 'consumption/ui/index.js', 'AnalysisWindow-DCpKwrtw.js'
    target_path = Path(path).name # Default to just the filename for top-level search
    
    for base in search_dirs:
        if not base.exists():
            continue
            
        # Try full path first (e.g. for assets in subdirectories)
        full_path = (base / path).resolve()
        if full_path.exists() and full_path.is_file():
            # Security: Ensure it's inside one of our base dirs
            if any(str(full_path).startswith(str(b.resolve())) for b in search_dirs):
                if full_path.suffix.lower() in ALLOWED_EXTENSIONS:
                    return FileResponse(full_path)

    raise HTTPException(status_code=404, detail="Asset not found or access denied")
