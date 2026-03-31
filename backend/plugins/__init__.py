"""Plugin registry — add one import per installed plugin.

To install a new plugin:
  1. Drop its directory under backend/plugins/<name>/
  2. Add one import line below and append to PLUGIN_ROUTERS
"""
from plugins.transformer_loading.routes import router as transformer_loading_router
from plugins.consumption.routes import router as consumption_router
from plugins.voltage.routes import router as voltage_router

PLUGIN_ROUTERS = [
    transformer_loading_router,
    consumption_router,
    voltage_router,
]
