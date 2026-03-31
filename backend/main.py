"""Main Application Entry Point (FastAPI equivalent to Fastify)."""
# Force reload for route detection
from contextlib import asynccontextmanager
import logging
import os
import sys
from pathlib import Path

# Load .env from project root for local development.
# override=False means real env vars (e.g. injected by Docker Compose) always win.
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)
except ImportError:
    print("dotenv not installed")
    pass

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

# Feature Slice Routers
from src.shared.config_watcher import watcher
# Plugin Routers
from plugins import PLUGIN_ROUTERS
from src.grid.topology_routes import router as topology_router
from src.grid.display_rule_routes import router as display_rule_router
from src.discovery.routes import router as discovery_router
from src.discovery.alarm_routes import router as alarm_router
from src.analytics.routes import router as analytics_router
from src.agent.routes import router as agent_router
from src.shared.model_routes import router as model_router

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(name)s | %(message)s")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load the CIM-Graph FeederModels and start config watcher."""
    from src.shared.cim_registry import CimModelRegistry
    from src.shared.database_setup import init_db

    # Initialize databases (topology + admin)
    init_db()

    registry = CimModelRegistry.get_instance()
    registry.load_all()
    
    # Start the background config watcher
    await watcher.start()
    
    yield
    # shutdown
    watcher.stop()

app = FastAPI(
    title="Grid-Scale Analytical Agent",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS configuration
allowed_origins_env = os.environ.get("ALLOWED_ORIGINS")
if allowed_origins_env:
    origins = [origin.strip() for origin in allowed_origins_env.split(",") if origin.strip()]
else:
    origins = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:8000",
        "http://localhost:8080",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(topology_router)
app.include_router(display_rule_router)
app.include_router(discovery_router)
app.include_router(alarm_router)
app.include_router(analytics_router)
app.include_router(agent_router)
app.include_router(model_router)

# Plugin routes
for _plugin_router in PLUGIN_ROUTERS:
    app.include_router(_plugin_router)

# Mount static files for the UI
ui_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'frontend', 'dist')
if os.path.exists(ui_dir):
    app.mount("/", StaticFiles(directory=ui_dir, html=True), name="ui")
else:
    app.get("/")(lambda: {"message": "API is running. UI building not found. Run Vite dev server for frontend."})

if __name__ == "__main__":
    import uvicorn
    # Add project root to path automatically when running this file directly
    sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
