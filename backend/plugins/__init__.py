"""Plugin registry — auto-discovers all plugins under this package.

Plugins are discovered automatically but **disabled by default**.
To enable a plugin set the config override::

    POST /api/config  {"key": "plugin.<name>.enabled", "value": "true"}

The ConfigWatcher propagates the value to os.environ within its poll interval,
so no server restart is required.

To install a new plugin:
  1. Drop its directory under backend/plugins/<name>/
  2. Add a routes.py that defines a FastAPI ``router`` attribute

No manual registration needed — discovery is automatic.
"""
import importlib
import logging
import os
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException

logger = logging.getLogger(__name__)

# ------------------------------------------------------------------
# Auto-discovery
# ------------------------------------------------------------------
# Maps plugin name → its APIRouter
_discovered: dict[str, object] = {}

# Maps plugin name → its manifest dict
PLUGIN_MANIFESTS: dict[str, dict] = {}

_plugins_dir = Path(__file__).parent
for _entry in sorted(_plugins_dir.iterdir()):
    if not _entry.is_dir() or _entry.name.startswith("_"):
        continue
    try:
        # Read manifest.json BEFORE importing the route module
        # This is strictly required so that get_sdk() inside routes.py 
        # has access to its permissions at import time.
        manifest_path = _entry / "manifest.json"
        manifest = {}
        if manifest_path.exists():
            import json
            with open(manifest_path, "r", encoding="utf-8") as f:
                manifest = json.load(f)
        PLUGIN_MANIFESTS[_entry.name] = manifest

        _mod = importlib.import_module(f"plugins.{_entry.name}.routes")
        if hasattr(_mod, "router"):
            _discovered[_entry.name] = _mod.router
            
            logger.debug("Discovered plugin: %s", _entry.name)
    except ModuleNotFoundError:
        pass  # no routes.py — not a plugin directory
    except Exception as exc:
        logger.error("Failed to load plugin '%s': %s", _entry.name, exc)


# ------------------------------------------------------------------
# Enable / disable
# ------------------------------------------------------------------

def is_plugin_enabled(name: str) -> bool:
    """Return True if the plugin has been explicitly enabled via config_overrides."""
    return os.environ.get(f"plugin.{name}.enabled", "false").lower() == "true"


def _make_enabled_gate(name: str):
    """Return a FastAPI Depends that 404s when the plugin is disabled."""
    async def _check():
        if not is_plugin_enabled(name):
            raise HTTPException(
                status_code=404,
                detail=f"Plugin '{name}' is not enabled.",
            )
    return Depends(_check)


# ------------------------------------------------------------------
# Registration helper called from main.py
# ------------------------------------------------------------------

def include_plugin_routers(app: FastAPI) -> None:
    """Include every discovered plugin router, gated by its enabled status."""
    for name, router in _discovered.items():
        app.include_router(router, dependencies=[_make_enabled_gate(name)])
        logger.info("Registered plugin route: %s (enabled=%s)", name, is_plugin_enabled(name))


# ------------------------------------------------------------------
# Public surface for the registry endpoint
# ------------------------------------------------------------------

DISCOVERED_PLUGIN_NAMES: list[str] = list(_discovered.keys())
