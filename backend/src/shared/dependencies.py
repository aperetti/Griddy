"""Shared dependencies and global state for the Python backend.

This module centralizes the registry, engines, and repositories to avoid 
circular dependencies during the refactor into feature slices.
"""
from typing import Optional, Any, Dict
import logging
import os

from src.shared.cim_registry import CimModelRegistry
from src.shared.cim.repository import CimRepository
from src.grid.topology_engine import TopologyEngine
from src.grid.topology_service import TopologyService
from src.grid.display_rule_repository import DisplayRuleRepository
from src.grid.topology_repository import TopologyRepository
from src.grid.display_rule_engine import DisplayRuleEngine
from src.shared.meter_data_repository import IMeterDataRepository
from src.shared.meter_adapters.duckdb_adapter import DuckDBMeterDataRepository
from src.shared.alarm_repository import DuckDBAlarmRepository
from src.shared.database_setup import DB_PATH, ADMIN_DB_PATH, RULES_DB_PATH, PARQUET_DIR

logger = logging.getLogger(__name__)

# ── Global Instances ─────────────────────────────────────────────

# CIM graph repository (Persistence layer for Neo4j)
cim_repo = CimRepository()

def get_neo4j_driver():
    return cim_repo._get_driver()

# CIM model registry (populated during FastAPI lifespan startup)
registry = CimModelRegistry.get_instance(cim_repo)

# Display rule repository (persistence layer for rules.sqlite)
display_rule_repo = DisplayRuleRepository(RULES_DB_PATH)

# Display rule engine for node classification (Reads from rules.sqlite)
display_engine = DisplayRuleEngine(display_rule_repo)

# topology graph engine (dependency-free BFS over pre-computed CIM edges)
graph_engine = TopologyEngine()

# topology repository for mapping raw model data to UI response format
topology_repo = TopologyRepository(registry, graph_engine, display_engine)

# topology service for orchestrating graph construction and caching
topology_service = TopologyService(registry, graph_engine)

# Alarm repository for active alerts (Reads from DuckDB)
alarm_repo = DuckDBAlarmRepository(DB_PATH)

class MeterDataRepositoryProxy(IMeterDataRepository):
    """Proxy to dynamically resolve the active AMI adapter."""
    
    def __init__(self, default_db_path: str, default_parquet_dir: str):
        self.default_db_path = default_db_path
        self.default_parquet_dir = default_parquet_dir
        self._duckdb_repo = DuckDBMeterDataRepository(default_db_path, default_parquet_dir)
        
    def _get_active_repo(self) -> IMeterDataRepository:
        import os
        adapter = os.getenv("ami_adapter", "duckdb").lower()
        if adapter == "duckdb":
            return self._duckdb_repo
        return self._duckdb_repo

    def estimate_aggregate_consumption(self, node_ids: list[str], start_time: str, end_time: str):
        return self._get_active_repo().estimate_aggregate_consumption(node_ids, start_time, end_time)

    def get_aggregate_consumption(self, node_ids: list[str], node_weights: dict[str, dict[str, float]], start_time: str, end_time: str):
        return self._get_active_repo().get_aggregate_consumption(node_ids, node_weights, start_time, end_time)

    def estimate_voltage_distribution(self, node_ids: list[str], start_time: str, end_time: str):
        return self._get_active_repo().estimate_voltage_distribution(node_ids, start_time, end_time)

    def get_voltage_distribution(self, node_ids: list[str], start_time: str, end_time: str):
        return self._get_active_repo().get_voltage_distribution(node_ids, start_time, end_time)

    def estimate_map_voltage(self, start_time: str, end_time: str, agg: str, node_filter: Optional[list[str]] = None):
        return self._get_active_repo().estimate_map_voltage(start_time, end_time, agg, node_filter)

    def get_map_voltage(self, start_time: str, end_time: str, agg: str, node_filter: Optional[list[str]] = None):
        return self._get_active_repo().get_map_voltage(start_time, end_time, agg, node_filter)

    def estimate_map_edge_load(self, start_time: str, end_time: str, agg: str, node_filter: Optional[list[str]] = None):
        return self._get_active_repo().estimate_map_edge_load(start_time, end_time, agg, node_filter)

    def get_map_edge_load(self, start_time: str, end_time: str, agg: str, node_filter: Optional[list[str]] = None):
        return self._get_active_repo().get_map_edge_load(start_time, end_time, agg, node_filter)

    def get_phase_balancing(self, node_ids: list[str], start_time: str, end_time: str):
        return self._get_active_repo().get_phase_balancing(node_ids, start_time, end_time)

# Meter data repository for analytics
meter_data_repo: IMeterDataRepository = MeterDataRepositoryProxy(DB_PATH, PARQUET_DIR)


# ── Deprecated Helpers (Forward to TopologyService) ────────────────

def get_active_model_ids(models_param: Optional[str] = None) -> list[str]:
    """Parse the ?models= query param into a list of model IDs."""
    if not models_param:
        return registry.get_active_model_ids()
    return [m.strip() for m in models_param.split(",") if m.strip()]

def ensure_graph_built(model_ids: list[str] | None = None) -> tuple[list[dict], list[dict]]:
    return topology_service.ensure_graph_built(model_ids)

def resolve_request_ids(ids: list[str]) -> list[str]:
    return topology_service.resolve_request_ids(ids)

def resolve_to_storage_keys(node_ids: list[str]) -> list[str]:
    return topology_service.resolve_to_storage_keys(node_ids)
