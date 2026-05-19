"""Plugin registry — auto-discovers all plugins under this package.

Plugins are discovered automatically but **disabled by default**.
To enable a plugin set the config override::

    POST /api/config  {"key": "plugin.<name>.enabled", "value": "true"}

The ConfigWatcher propagates the value to os.environ within its poll interval,
so no server restart is required.

To install a new plugin:
  1. Drop its directory under backend/plugins/<name>/
  2. Add a routes.py that defines a FastAPI ``router`` attribute

No manual registration needed — discovery is automatic and live-reloaded every
10 seconds by the plugin watcher started in main.py lifespan.
"""
import importlib
import json
import logging
import os
import sys
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException

logger = logging.getLogger(__name__)

# ------------------------------------------------------------------
# Auto-discovery (runs once at import / startup)
# ------------------------------------------------------------------
# Maps plugin name → its APIRouter
_discovered: dict[str, object] = {}

# Tracks which plugin names have already had their router included in the app
_registered: set[str] = set()

# Maps plugin name → its manifest dict
PLUGIN_MANIFESTS: dict[str, dict] = {}

BUILTIN_PLUGINS_DIR = Path(__file__).parent
EXTERNAL_PLUGINS_DIR = Path("/data/config/plugins")

# Ensure external dir is in path for dynamic imports
if EXTERNAL_PLUGINS_DIR.exists() and str(EXTERNAL_PLUGINS_DIR) not in sys.path:
    sys.path.append(str(EXTERNAL_PLUGINS_DIR))

def _load_plugin_dir(entry: Path, is_external: bool = False) -> dict | None:
    """Load manifest and optionally routes for a single plugin directory.

    Returns the manifest dict on success, None if the directory should be skipped.
    """
    if not entry.is_dir() or entry.name.startswith("_"):
        return None
    try:
        manifest: dict = {}
        manifest_path = entry / "manifest.json"
        if manifest_path.exists():
            with open(manifest_path, "r", encoding="utf-8") as f:
                manifest = json.load(f)
        
        # Track origin for static asset serving later
        manifest["_is_external"] = is_external
        manifest["_path"] = str(entry)
        
        PLUGIN_MANIFESTS[entry.name] = manifest

        try:
            # External plugins are at the root of the external dir, so we import them directly
            # Built-in plugins are submodules of 'plugins'
            module_path = entry.name if is_external else f"plugins.{entry.name}"
            _mod = importlib.import_module(f"{module_path}.routes")
            if hasattr(_mod, "router"):
                _discovered[entry.name] = _mod.router
        except (ModuleNotFoundError, ImportError):
            pass  # Frontend-only plugin or no routes defined

        return manifest
    except Exception as exc:
        logger.error("Failed to load plugin '%s': %s", entry.name, exc)
        return None

# Discover Built-ins
for _entry in sorted(_builtin_plugins_dir.iterdir()):
    _load_plugin_dir(_entry, is_external=False)

# Discover Externals
if _external_plugins_dir.exists():
    for _entry in sorted(_external_plugins_dir.iterdir()):
        if _entry.name not in PLUGIN_MANIFESTS:
            _load_plugin_dir(_entry, is_external=True)


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
# Registration helper called from main.py at startup
# ------------------------------------------------------------------

def include_plugin_routers(app: FastAPI) -> None:
    """Include every discovered plugin router, gated by its enabled status."""
    for name, router in _discovered.items():
        app.include_router(router, dependencies=[_make_enabled_gate(name)])
        _registered.add(name)
        logger.info("Registered plugin route: %s (enabled=%s)", name, is_plugin_enabled(name))


# ------------------------------------------------------------------
# Live rescan — called periodically by the plugin watcher in main.py
# ------------------------------------------------------------------

def rescan_and_register(app: FastAPI) -> list[str]:
    """Scan for plugin directories added since startup and hot-register them.

    Safe to call repeatedly — only acts on directories not yet known.
    Returns the list of newly discovered plugin names.
    """
    new_plugins: list[str] = []

    # Helper to check a directory
    def _scan_dir(parent: Path, is_extern: bool):
        if not parent.exists():
            return
        for entry in sorted(parent.iterdir()):
            if not entry.is_dir() or entry.name.startswith("_"):
                continue
            name = entry.name
            if name in PLUGIN_MANIFESTS:
                continue  # already known — skip

            manifest = _load_plugin_dir(entry, is_external=is_extern)
            if manifest is None:
                continue

            new_plugins.append(name)

            # Include router if one was loaded and not yet registered
            if name in _discovered and name not in _registered:
                app.include_router(
                    _discovered[name],  # type: ignore[arg-type]
                    dependencies=[_make_enabled_gate(name)],
                )
                _registered.add(name)
                logger.info("Hot-registered plugin route: %s", name)

    _scan_dir(BUILTIN_PLUGINS_DIR, False)
    _scan_dir(EXTERNAL_PLUGINS_DIR, True)

    if new_plugins:
        # Rebuild the public name list in-place so registry_routes sees the update
        DISCOVERED_PLUGIN_NAMES.clear()
        DISCOVERED_PLUGIN_NAMES.extend(sorted(PLUGIN_MANIFESTS.keys()))

    return new_plugins


# ------------------------------------------------------------------
# Public surface for the registry endpoint
# ------------------------------------------------------------------

DISCOVERED_PLUGIN_NAMES: list[str] = sorted(list(PLUGIN_MANIFESTS.keys()))
