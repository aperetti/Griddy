"""
Plugin SDK — the only interface plugins should use to access data.

Plugins must never create their own database connections (no GraphDatabase.driver,
no duckdb.connect, no sqlite3.connect).  All data access goes through this SDK,
which delegates to the existing shared infrastructure.

Usage in a plugin route:
    from plugins.sdk import sdk

    rows = sdk.cim.run_cypher(CYPHER, {"node_ids": ids})
    nodes, edges = sdk.topology.get_downstream(node_id)
    result = sdk.analytics.get_consumption(node_ids, start, end)
"""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# CIM Service — wraps CimModelRegistry / CimModelManager
# ---------------------------------------------------------------------------

class PluginCimService:
    """Query CIM data stored in Neo4j via the shared registry."""

    @property
    def _registry(self):
        from src.shared.dependencies import registry
        return registry

    def run_cypher(self, query: str, params: dict | None = None) -> list[dict]:
        """Execute a read-only Cypher query across all active CIM models.

        Results from all loaded feeders are merged and returned as a flat list.
        Raises ValueError on write attempts (CREATE/MERGE/SET/DELETE).
        """
        import re
        _WRITE = re.compile(
            r"\b(CREATE|MERGE|SET|DELETE|REMOVE|DROP|CALL\s+apoc\..*write)\b",
            re.IGNORECASE,
        )
        if _WRITE.search(query):
            raise ValueError("Plugin SDK: write Cypher is not permitted.")

        results: list[dict] = []
        for _, mgr in self._registry.get_managers():
            try:
                rows = mgr.execute_cypher(query, params or {})
                if rows:
                    results.extend(rows)
            except Exception as exc:
                logger.warning("sdk.cim.run_cypher error: %s", exc)
        return results

    def get_equipment(self, mrid: str) -> dict | None:
        """Return enriched equipment detail for a given CIM mRID, or None."""
        for _, mgr in self._registry.get_managers():
            result = mgr.get_equipment_detail(mrid)
            if result:
                return result
        return None

    def get_equipment_expanded(self, mrid: str) -> dict | None:
        """Like get_equipment but with connectivity nodes expanded."""
        for _, mgr in self._registry.get_managers():
            result = mgr.get_equipment_detail_expanded(mrid)
            if result:
                return result
        return None

    def get_node_details(self, node_id: str) -> dict | None:
        """Return CIM details for a connectivity node (bus/junction)."""
        for _, mgr in self._registry.get_managers():
            result = mgr.get_node_cim_details(node_id)
            if result:
                return result
        return None

    def get_equipment_by_class(self, cim_class: str) -> list[dict]:
        """Return all equipment of the given CIM class across active models."""
        results: list[dict] = []
        for _, mgr in self._registry.get_managers():
            try:
                results.extend(mgr.get_all_equipment_by_class(cim_class) or [])
            except Exception as exc:
                logger.warning("sdk.cim.get_equipment_by_class error: %s", exc)
        return results

    def get_schema(self) -> dict:
        """Return the aggregated CIM schema: {class_name: {attributes, count}}."""
        return self._registry.get_cim_schema()

    def search(self, query: str, cim_class: str | None = None) -> list[dict]:
        """Full-text search across all loaded CIM models."""
        return self._registry.search_all_models(query, class_name=cim_class)


# ---------------------------------------------------------------------------
# Topology Service — wraps NetworkXEngine
# ---------------------------------------------------------------------------

class PluginTopologyService:
    """Traverse the grid topology graph via the shared NetworkX engine."""

    @property
    def _engine(self):
        from src.shared.dependencies import graph_engine
        return graph_engine

    def get_downstream(
        self,
        node_id: str,
        max_depth: int | None = None,
    ) -> tuple[list[str], list[str]]:
        """Return (node_ids, edge_ids) downstream of the given node."""
        return self._engine.find_downstream(node_id, max_depth=max_depth)

    def get_upstream(self, node_id: str) -> tuple[list[str], list[str]]:
        """Return (node_ids, edge_ids) upstream of the given node."""
        return self._engine.find_upstream(node_id)

    def get_active_model_ids(self) -> list[str]:
        """Return the IDs of currently loaded CIM models."""
        from src.shared.dependencies import registry
        return registry.get_active_model_ids()


# ---------------------------------------------------------------------------
# Analytics Service — wraps existing use-case classes
# ---------------------------------------------------------------------------

class PluginAnalyticsService:
    """Run pre-built analytics queries via the shared use-case layer."""

    @property
    def _engine(self):
        from src.shared.dependencies import graph_engine
        return graph_engine

    @property
    def _db_path(self) -> str:
        from src.shared.database_setup import DB_PATH
        return DB_PATH

    @property
    def _parquet_dir(self) -> str:
        from src.shared.database_setup import PARQUET_DIR
        return PARQUET_DIR

    def get_consumption(
        self,
        node_ids: list[str],
        start_time: str,
        end_time: str,
    ) -> dict[str, Any]:
        """Aggregate consumption time series for the given nodes."""
        from src.analytics.calculate_consumption import CalculateAggregateConsumptionUseCase
        uc = CalculateAggregateConsumptionUseCase(self._engine, self._db_path, self._parquet_dir)
        return uc.execute(node_ids, start_time, end_time)

    def get_voltage_distribution(
        self,
        node_ids: list[str],
        start_time: str,
        end_time: str,
        degrees: int | None = None,
    ) -> dict[str, Any]:
        """Voltage distribution (KDE + timeseries) for the given nodes."""
        from src.analytics.calculate_voltage import CalculateVoltageDistributionUseCase
        uc = CalculateVoltageDistributionUseCase(self._engine, self._db_path, self._parquet_dir)
        return uc.execute(node_ids, start_time, end_time, degrees=degrees)

    def estimate_consumption(
        self,
        node_ids: list[str],
        start_time: str,
        end_time: str,
    ) -> dict[str, Any]:
        """Estimate row count before running a full consumption query."""
        from src.analytics.calculate_consumption import CalculateAggregateConsumptionUseCase
        uc = CalculateAggregateConsumptionUseCase(self._engine, self._db_path, self._parquet_dir)
        return uc.estimate(node_ids, start_time, end_time)

    def estimate_voltage(
        self,
        node_ids: list[str],
        start_time: str,
        end_time: str,
        degrees: int | None = None,
    ) -> dict[str, Any]:
        """Estimate row count before running a full voltage distribution query."""
        from src.analytics.calculate_voltage import CalculateVoltageDistributionUseCase
        uc = CalculateVoltageDistributionUseCase(self._engine, self._db_path, self._parquet_dir)
        return uc.estimate(node_ids, start_time, end_time, degrees=degrees)


# ---------------------------------------------------------------------------
# Top-level SDK singleton
# ---------------------------------------------------------------------------

class PluginSDK:
    """Entry point for all plugin data access.

    Import the module-level `sdk` instance — do not instantiate this class.
    """
    cim: PluginCimService = PluginCimService()
    topology: PluginTopologyService = PluginTopologyService()
    analytics: PluginAnalyticsService = PluginAnalyticsService()


sdk = PluginSDK()
