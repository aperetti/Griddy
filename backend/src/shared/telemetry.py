import logging
import json
import time
import threading
import os
from pathlib import Path
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.semconv.resource import ResourceAttributes

logger = logging.getLogger(__name__)

def setup_tracing(service_name: str, endpoint: str = None):
    if endpoint is None:
        endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "http://tempo:4317")
    """Configures OpenTelemetry tracing."""
    resource = Resource(attributes={
        ResourceAttributes.SERVICE_NAME: service_name
    })
    
    provider = TracerProvider(resource=resource)
    processor = BatchSpanProcessor(OTLPSpanExporter(endpoint=endpoint, insecure=True))
    provider.add_span_processor(processor)
    trace.set_tracer_provider(provider)
    
    logger.info("OpenTelemetry tracing initialized for service: %s, exporting to: %s", service_name, endpoint)

class TelemetryManager:
    def __init__(self, config_path: str, poll_interval: int = 10):
        self.config_path = Path(config_path)
        self.poll_interval = poll_interval
        self._stop_event = threading.Event()
        self._thread = None
        self._last_mtime = 0

    def start(self):
        """Starts the telemetry configuration poller in a background thread."""
        if self._thread is not None:
            return
        
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()
        logger.info("Telemetry manager started, polling %s every %ds", self.config_path, self.poll_interval)

    def stop(self):
        """Stops the telemetry configuration poller."""
        self._stop_event.set()
        if self._thread:
            self._thread.join()
            self._thread = None

    def _run(self):
        while not self._stop_event.is_set():
            try:
                self.update_log_levels()
            except Exception as e:
                logger.error("Error updating log levels: %s", e)
            
            time.sleep(self.poll_interval)

    def update_log_levels(self):
        if not self.config_path.exists():
            return

        current_mtime = self.config_path.stat().st_mtime
        if current_mtime <= self._last_mtime:
            return

        logger.info("Detected changes in %s, updating log levels...", self.config_path)
        with open(self.config_path, 'r') as f:
            config = json.load(f)

        backend_config = config.get('services', {}).get('python_backend', {})
        
        # 1. Update global level
        global_level = config.get('global_level', 'INFO').upper()
        logging.getLogger().setLevel(getattr(logging, global_level, logging.INFO))

        # 2. Update default backend level
        default_level = backend_config.get('default_level', 'INFO').upper()
        # For the main backend logger (assuming it's 'src' or similar)
        # We can set the level for the root of our app
        logging.getLogger('src').setLevel(getattr(logging, default_level, logging.INFO))

        # 3. Update overrides
        overrides = backend_config.get('overrides', {})
        for module, level in overrides.items():
            level_upper = level.upper()
            numeric_level = getattr(logging, level_upper, None)
            if numeric_level is not None:
                logging.getLogger(module).setLevel(numeric_level)
                logger.info("Set logger %s to level %s", module, level_upper)
            else:
                logger.warning("Invalid log level %s for module %s", level, module)

        self._last_mtime = current_mtime

def init_telemetry(workspace_root: Path):
    """Initializes and starts the telemetry manager."""
    config_path = os.environ.get("TELEMETRY_CONFIG_PATH")
    if not config_path:
        config_path = str(workspace_root / "infra" / "telemetry_config.json")
    
    manager = TelemetryManager(config_path)
    manager.start()
    return manager
