"""Main Application Entry Point (FastAPI equivalent to Fastify)."""
# Force reload for route detection
from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from src.shared import old_controller as agent_controller
import os

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(name)s | %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load the CIM-Graph FeederModels and start config watcher."""
    from src.shared.cim_registry import CimModelRegistry
    from src.shared.config_watcher import watcher

    registry = CimModelRegistry.get_instance()
    registry.load_default()
    
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

# CORS for local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(agent_controller.router)

# Mount static files for the UI
ui_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'frontend', 'dist')
if os.path.exists(ui_dir):
    app.mount("/", StaticFiles(directory=ui_dir, html=True), name="ui")
else:
    app.get("/")(lambda: {"message": "API is running. UI building not found. Run Vite dev server for frontend."})

if __name__ == "__main__":
    import uvicorn
    # Add project root to path automatically when running this file directly
    import sys
    sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
    
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
