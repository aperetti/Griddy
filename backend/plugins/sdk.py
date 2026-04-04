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

    def __init__(self, permissions: list[str]):
        self.permissions = permissions

    def _check(self, required: str):
        if required not in self.permissions:
            raise PermissionError(f"SDK Error: Missing required permission '{required}'")

    @property
    def _registry(self):
        from src.shared.dependencies import registry
        return registry

    def run_cypher(self, query: str, params: dict | None = None) -> list[dict]:
        """Execute a read-only Cypher query across all active CIM models."""
        self._check("cim:read")
        import re
        _WRITE = re.compile(
            r"\b(CREATE|MERGE|SET|DELETE|REMOVE|DROP|FOREACH"
            r"|CALL\s+apoc\.(create|merge|refactor|periodic|lock|trigger|"
            r"custom|graph\.create|util\.sleep))\b",
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
        self._check("cim:read")
        for _, mgr in self._registry.get_managers():
            result = mgr.get_equipment_detail(mrid)
            if result:
                return result
        return None

    def get_equipment_expanded(self, mrid: str) -> dict | None:
        """Like get_equipment but with connectivity nodes expanded."""
        self._check("cim:read")
        for _, mgr in self._registry.get_managers():
            result = mgr.get_equipment_detail_expanded(mrid)
            if result:
                return result
        return None

    def get_node_details(self, node_id: str) -> dict | None:
        """Return CIM details for a connectivity node (bus/junction)."""
        self._check("cim:read")
        for _, mgr in self._registry.get_managers():
            result = mgr.get_node_cim_details(node_id)
            if result:
                return result
        return None

    def get_equipment_by_class(self, cim_class: str) -> list[dict]:
        """Return all equipment of the given CIM class across active models."""
        self._check("cim:read")
        results: list[dict] = []
        for _, mgr in self._registry.get_managers():
            try:
                results.extend(mgr.get_all_equipment_by_class(cim_class) or [])
            except Exception as exc:
                logger.warning("sdk.cim.get_equipment_by_class error: %s", exc)
        return results

    def get_schema(self) -> dict:
        """Return the aggregated CIM schema: {class_name: {attributes, count}}."""
        self._check("cim:read")
        return self._registry.get_cim_schema()

    def search(self, query: str, cim_class: str | None = None) -> list[dict]:
        """Full-text search across all loaded CIM models."""
        self._check("cim:read")
        return self._registry.search_all_models(query, class_name=cim_class)


# ---------------------------------------------------------------------------
# Topology Service — wraps NetworkXEngine
# ---------------------------------------------------------------------------

class PluginTopologyService:
    """Traverse the grid topology graph via the shared NetworkX engine."""

    def __init__(self, permissions: list[str]):
        self.permissions = permissions

    def _check(self, required: str):
        if required not in self.permissions:
            raise PermissionError(f"SDK Error: Missing required permission '{required}'")

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
        self._check("topology:read")
        return self._engine.find_downstream(node_id, max_depth=max_depth)

    def get_upstream(self, node_id: str) -> tuple[list[str], list[str]]:
        """Return (node_ids, edge_ids) upstream of the given node."""
        self._check("topology:read")
        return self._engine.find_upstream(node_id)

    def get_active_model_ids(self) -> list[str]:
        """Return the IDs of currently loaded CIM models."""
        self._check("topology:read")
        from src.shared.dependencies import registry
        return registry.get_active_model_ids()


# ---------------------------------------------------------------------------
# Analytics Service — wraps existing use-case classes
# ---------------------------------------------------------------------------

class PluginAnalyticsService:
    """Run pre-built analytics queries via the shared use-case layer."""

    def __init__(self, permissions: list[str]):
        self.permissions = permissions

    def _check(self, required: str):
        if required not in self.permissions:
            raise PermissionError(f"SDK Error: Missing required permission '{required}'")

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
        self._check("analytics:consumption")
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
        self._check("analytics:voltage")
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
        self._check("analytics:consumption")
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
        self._check("analytics:voltage")
        from src.analytics.calculate_voltage import CalculateVoltageDistributionUseCase
        uc = CalculateVoltageDistributionUseCase(self._engine, self._db_path, self._parquet_dir)
        return uc.estimate(node_ids, start_time, end_time, degrees=degrees)

    def get_voltage_map(
        self,
        agg: str,
        start_time: str,
        end_time: str,
        start_node_id: str | None = None,
    ) -> dict[str, Any]:
        """Calculate aggregated voltage values for map-wide visualization."""
        self._check("analytics:voltage")
        from src.analytics.map_voltage import MapVoltageUseCase
        uc = MapVoltageUseCase(self._engine, self._db_path, self._parquet_dir)
        return uc.execute(start_time, end_time, agg, start_node_id=start_node_id)

    def estimate_voltage_map(
        self,
        agg: str,
        start_time: str,
        end_time: str,
        start_node_id: str | None = None,
    ) -> dict[str, Any]:
        """Estimate row count before running a full voltage map query."""
        self._check("analytics:voltage")
        from src.analytics.map_voltage import MapVoltageUseCase
        uc = MapVoltageUseCase(self._engine, self._db_path, self._parquet_dir)
        return uc.estimate(start_time, end_time, agg, start_node_id=start_node_id)

    def get_edge_load_map(
        self,
        agg: str,
        start_time: str,
        end_time: str,
        start_node_id: str | None = None,
    ) -> dict[str, Any]:
        """Calculate aggregated edge load for map-wide visualization."""
        self._check("analytics:load")
        from src.analytics.map_edge_load import MapEdgeLoadUseCase
        uc = MapEdgeLoadUseCase(self._engine, self._db_path)
        return uc.execute(start_time, end_time, agg, start_node_id=start_node_id)

    def estimate_edge_load_map(
        self,
        agg: str,
        start_time: str,
        end_time: str,
        start_node_id: str | None = None,
    ) -> dict[str, Any]:
        """Estimate row count before running a full edge load query."""
        self._check("analytics:load")
        from src.analytics.map_edge_load import MapEdgeLoadUseCase
        uc = MapEdgeLoadUseCase(self._engine, self._db_path)
        return uc.estimate(start_time, end_time, agg, start_node_id=start_node_id)



# ---------------------------------------------------------------------------
# Top-level SDK singleton
# ---------------------------------------------------------------------------

class PluginSDK:
    """Entry point for all plugin data access."""
    def __init__(self, plugin_name: str, permissions: list[str]):
        self.plugin_name = plugin_name
        self.permissions = permissions
        self.cim = PluginCimService(permissions)
        self.topology = PluginTopologyService(permissions)
        self.analytics = PluginAnalyticsService(permissions)

def get_sdk(plugin_name: str) -> PluginSDK:
    """Factory to get an authorized SDK for a specific plugin."""
    import json
    from pathlib import Path
    
    # Path to the plugin's directory relative to this file
    manifest_path = Path(__file__).parent / plugin_name / "manifest.json"
    permissions = []
    
    if manifest_path.exists():
        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                manifest = json.load(f)
                permissions = manifest.get("permissions", [])
        except Exception as exc:
            logger.warning("SDK Warning: Failed to read manifest for '%s': %s", plugin_name, exc)
            
    return PluginSDK(plugin_name, permissions)
