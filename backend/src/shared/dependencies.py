"""Shared dependencies and global state for the Python backend.

This module centralizes the registry, engines, and repositories to avoid 
circular dependencies during the refactor into feature slices.
"""
from typing import Optional, Any, Dict
from src.shared.cim_registry import CimModelRegistry
from src.shared.sqlite_repository import AlarmRepository
from src.grid.topology_engine import TopologyEngine
from src.grid.display_rule_engine import DisplayRuleEngine
from src.shared.meter_data_repository import IMeterDataRepository
from src.shared.meter_adapters.duckdb_adapter import DuckDBMeterDataRepository
from src.shared.database_setup import DB_PATH, ADMIN_SQLITE_PATH, PARQUET_DIR

# ── Global Instances ─────────────────────────────────────────────
# CIM model registry (populated during FastAPI lifespan startup)
registry = CimModelRegistry.get_instance()

# Alarms are stored in admin.sqlite alongside display-rule configuration
alarm_repo = AlarmRepository(ADMIN_SQLITE_PATH)

# Display rule engine for node classification
display_engine = DisplayRuleEngine(ADMIN_SQLITE_PATH)

# topology graph engine (dependency-free BFS over pre-computed CIM edges)
graph_engine = TopologyEngine()

class MeterDataRepositoryProxy(IMeterDataRepository):
    """Proxy to dynamically resolve the active AMI adapter."""
    
    def __init__(self, default_db_path: str, default_parquet_dir: str):
        self.default_db_path = default_db_path
        self.default_parquet_dir = default_parquet_dir
        self._duckdb_repo = DuckDBMeterDataRepository(default_db_path, default_parquet_dir)
        # In the future, other repositories (Snowflake, Databricks) can be initialized here
        
    def _get_active_repo(self) -> IMeterDataRepository:
        import os
        adapter = os.getenv("ami_adapter", "duckdb").lower()
        # Fallback to DuckDB if adapter is unrecognized or set to duckdb
        if adapter == "duckdb":
            return self._duckdb_repo
        # Other adapters would be returned here
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

# Meter data repository for analytics (uses proxy to support runtime adapter switching)
meter_data_repo: IMeterDataRepository = MeterDataRepositoryProxy(DB_PATH, PARQUET_DIR)

# Mutable state for graph tracking
_graph_built_for: set[str] = set()


# ── Shared Helpers ───────────────────────────────────────────────
def get_active_model_ids(models_param: Optional[str] = None) -> list[str]:
    """Parse the ?models= query param into a list of model IDs."""
    if not models_param:
        return registry.get_active_model_ids()
    return [m.strip() for m in models_param.split(",") if m.strip()]


def ensure_graph_built(model_ids: list[str] | None = None):
    """Build the NetworkX graph from the in-memory CIM models."""
    global _graph_built_for

    requested = set(model_ids) if model_ids else set(registry.get_active_model_ids())
    if requested == _graph_built_for:
        return

    from src.grid.graph_node import GraphNode

    nodes_raw, edges = registry.get_combined_topology(
        list(requested) if model_ids else None
    )

    nodes = [
        GraphNode(
            id=n["node_id"],
            type=n["node_type"],
            name=n["name"] or n["node_id"],
            phases=n.get("phases_present") or ["A", "B", "C"],
            latitude=n["latitude"],
            longitude=n["longitude"],
            attached_equipment=n.get("attached_equipment", []),
            base_voltage_kv=n.get("base_voltage_kv"),
        )
        for n in nodes_raw
    ]

    graph_engine.build_graph(nodes=nodes, edges=edges)
    _graph_built_for = requested
