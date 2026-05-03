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

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from starlette.responses import Response
import orjson
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
import time

from src.shared.perf import dump_server_timing, phase_timer, reset_phases


class TimedORJSONResponse(Response):
    """Default response class that serializes via orjson.

    orjson is 5-10x faster than the default json.dumps + jsonable_encoder
    pipeline for dict/list/datetime payloads. Wrapping render() in a phase
    timer publishes the encode cost in the Server-Timing header.
    """

    media_type = "application/json"

    def render(self, content) -> bytes:
        with phase_timer("response_encode"):
            return orjson.dumps(
                content,
                option=orjson.OPT_NON_STR_KEYS | orjson.OPT_SERIALIZE_NUMPY,
            )

# Feature Slice Routers
from src.shared.config_watcher import watcher
from src.shared.telemetry import init_telemetry, setup_tracing
# Plugin system
from plugins import include_plugin_routers
from plugins.registry_routes import router as plugin_registry_router
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

    # Initialize telemetry (dynamic logging)
    workspace_root = Path(__file__).resolve().parents[1]
    init_telemetry(workspace_root)

    # Initialize tracing
    setup_tracing("grid-backend")
    FastAPIInstrumentor.instrument_app(app)

    yield
    # shutdown
    watcher.stop()

app = FastAPI(
    title="Grid-Scale Analytical Agent",
    version="1.0.0",
    lifespan=lifespan,
    default_response_class=TimedORJSONResponse,
)

# Compress JSON payloads above 1 KiB. Time-series responses with repetitive
# ISO timestamps + floats compress 5-10x.
app.add_middleware(GZipMiddleware, minimum_size=1024, compresslevel=5)

access_logger = logging.getLogger("api.access")

@app.middleware("http")
async def log_requests(request: Request, call_next):
    reset_phases()
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    process_ms = process_time * 1000
    phases_str = dump_server_timing()
    server_timing = f"total;dur={process_ms:.2f}"
    if phases_str:
        server_timing = f"{server_timing}, {phases_str}"
    response.headers["Server-Timing"] = server_timing
    # Browsers won't expose custom response headers to JS by default. Allow
    # frontend perf.ts to read Server-Timing across origins (CORS).
    existing_expose = response.headers.get("Access-Control-Expose-Headers", "")
    if "Server-Timing" not in existing_expose:
        response.headers["Access-Control-Expose-Headers"] = (
            f"{existing_expose}, Server-Timing".lstrip(", ")
        )
    # Structured log format optimized for Loki parsing
    access_logger.info(
        f"API Request: method={request.method} path={request.url.path} "
        f"status={response.status_code} duration_ms={process_ms:.2f} "
        f"phases=[{phases_str}] "
        f"client={request.client.host if request.client else 'unknown'}"
    )
    return response

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
        "http://localhost:8081"
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

# Plugin routes (each gated by its enabled status in config_overrides)
app.include_router(plugin_registry_router)
include_plugin_routers(app)

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
