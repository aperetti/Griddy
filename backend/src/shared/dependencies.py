"""Shared dependencies and global state for the Python backend.

This module centralizes the registry, engines, and repositories to avoid 
circular dependencies during the refactor into feature slices.
"""
from typing import Optional, Any, Dict
from neo4j import GraphDatabase
import logging
import os

# ── Global Instances ─────────────────────────────────────────────
_neo4j_driver = None

def get_neo4j_driver():
    """Returns the global Neo4j driver instance, creating it if necessary."""
    global _neo4j_driver
    if _neo4j_driver is None:
        url = os.getenv("CIMG_URL")
        if not url:
            return None
        user = os.getenv("CIMG_USERNAME", "neo4j")
        password = os.getenv("CIMG_PASSWORD", "password123")
        _neo4j_driver = GraphDatabase.driver(url, auth=(user, password))
    return _neo4j_driver
from src.shared.cim_registry import CimModelRegistry

logger = logging.getLogger(__name__)
from src.grid.topology_engine import TopologyEngine
from src.grid.display_rule_engine import DisplayRuleEngine
from src.shared.meter_data_repository import IMeterDataRepository
from src.shared.meter_adapters.duckdb_adapter import DuckDBMeterDataRepository
from src.shared.alarm_repository import DuckDBAlarmRepository
from src.shared.database_setup import DB_PATH, ADMIN_DB_PATH, RULES_DB_PATH, PARQUET_DIR

# ── Global Instances ─────────────────────────────────────────────
# CIM model registry (populated during FastAPI lifespan startup)
registry = CimModelRegistry.get_instance()

# Display rule engine for node classification (Reads from rules.sqlite)
display_engine = DisplayRuleEngine(RULES_DB_PATH)

# topology graph engine (dependency-free BFS over pre-computed CIM edges)
graph_engine = TopologyEngine()

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
        # Fallback to DuckDB if adapter is unrecognized or set to duckdb
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

# Meter data repository for analytics (uses proxy to support runtime adapter switching)
meter_data_repo: IMeterDataRepository = MeterDataRepositoryProxy(DB_PATH, PARQUET_DIR)

# Mutable state for graph tracking
_graph_built_for: set[str] = set()
_cached_nodes: list[dict] = []
_cached_edges: list[dict] = []
_edge_id_to_nodes: dict[str, list[str]] = {}
_equipment_to_node: dict[str, str] = {}
_node_to_equipment_names: dict[str, list[str]] = {}
_node_to_equipment_mrids: dict[str, list[str]] = {}
_node_to_energy_consumers: dict[str, list[str]] = {}


# ── Shared Helpers ───────────────────────────────────────────────
def get_active_model_ids(models_param: Optional[str] = None) -> list[str]:
    """Parse the ?models= query param into a list of model IDs."""
    if not models_param:
        return registry.get_active_model_ids()
    return [m.strip() for m in models_param.split(",") if m.strip()]


def ensure_graph_built(model_ids: list[str] | None = None) -> tuple[list[dict], list[dict]]:
    """Build the NetworkX graph from the in-memory CIM models. Returns (nodes_raw, edges_raw)."""
    global _graph_built_for, _edge_id_to_nodes, _equipment_to_node, _node_to_equipment_names
    global _node_to_equipment_mrids, _node_to_energy_consumers, _cached_nodes, _cached_edges

    import time
    start_total = time.time()
    requested = set(model_ids) if model_ids else set(registry.get_active_model_ids())
    
    if requested == _graph_built_for and _cached_nodes:
        return _cached_nodes, _cached_edges

    logger.info("[Dependencies] Building graph for models: %s", requested)
    t0 = time.time()
    nodes_raw, edges = registry.get_combined_topology(
        list(requested) if model_ids else None
    )
    logger.info("[Dependencies] registry.get_combined_topology took %.2fs", time.time() - t0)

    from src.grid.graph_node import GraphNode
    t1 = time.time()
    nodes = [
        GraphNode(
            id=n["node_id"],
            type=n["node_type"],
            name=n["name"] or n["node_id"],
            phases=n.get("phases") or ["A", "B", "C"],
            latitude=n["latitude"],
            longitude=n["longitude"],
            attached_equipment=n.get("attached_equipment", []),
            base_voltage_kv=n.get("base_voltage_kv"),
        )
        for n in nodes_raw
    ]
    logger.info("[Dependencies] GraphNode instantiation took %.2fs", time.time() - t1)

    t2 = time.time()
    graph_engine.build_graph(nodes=nodes, edges=edges)
    logger.info("[Dependencies] graph_engine.build_graph took %.2fs", time.time() - t2)
    
    # Update edge -> node mapping (CLEAR AND UPDATE, don't rebind)
    t3 = time.time()
    _edge_id_to_nodes.clear()
    for e in edges:
        eid = e.get("edge_id")
        if eid:
            _edge_id_to_nodes[eid.upper()] = [e["from_node_id"].upper(), e["to_node_id"].upper()]
    logger.info("[Dependencies] Edge mapping took %.2fs", time.time() - t3)

    # Update mapping between topological entities and storage keys (CLEAR AND UPDATE)
    t4 = time.time()
    _equipment_to_node.clear()
    _node_to_equipment_names.clear()
    _node_to_equipment_mrids.clear()
    _node_to_energy_consumers.clear()
    
    for n in nodes_raw:
        # Normalize node ID to uppercase for internal lookup
        nid = n["node_id"].upper()
        names = []
        mrids = []
        consumers = []
        for eq in n.get("attached_equipment", []):
            mrid = eq.get("mrid")
            name = eq.get("name")
            eq_type = eq.get("type")
            
            if mrid:
                # Normalize equipment mRID to uppercase for internal lookup
                mrid_up = mrid.upper()
                _equipment_to_node[mrid_up] = nid
                mrids.append(mrid_up)
                # DO NOT add mRID to energy consumers; Parquet only contains 'name'
            if name:
                # KEEP EXACT CASE for the name (storage key)
                names.append(name)
                if eq_type == "EnergyConsumer":
                    consumers.append(name)
        _node_to_equipment_names[nid] = names
        _node_to_equipment_mrids[nid] = mrids
        _node_to_energy_consumers[nid] = consumers
    logger.info("[Dependencies] Equipment mapping took %.2fs", time.time() - t4)

    _graph_built_for = requested
    _cached_nodes = nodes_raw
    _cached_edges = edges
    
    logger.info("[Dependencies] total ensure_graph_built took %.2fs", time.time() - start_total)
    return nodes_raw, edges

def resolve_request_ids(ids: list[str]) -> list[str]:
    """Resolves a list of IDs (nodes, edges, or equipment) to topological ConnectivityNode IDs."""
    ensure_graph_built()
    resolved_nodes = set()
    
    for ident in ids:
        # Normalize input ID
        ident_up = ident.upper()
        if ident_up.startswith("URN:UUID:"):
            ident_up = ident_up[9:]
        
        # 1. Is it a known connectivity node?
        if ident_up in graph_engine._nodes:
            resolved_nodes.add(ident_up)
            continue
        
        # 2. Is it a known equipment ID attached to a node?
        if ident_up in _equipment_to_node:
            resolved_nodes.add(_equipment_to_node[ident_up])
            continue

        # 3. Is it a known edge (ACLineSegment, Transformer)?
        if ident_up in _edge_id_to_nodes:
            # Note: _edge_id_to_nodes is populated from edges.edge_id, 
            # which is also normalized in ensure_graph_built usually.
            resolved_nodes.update(_edge_id_to_nodes[ident_up])
            continue
            
        # 4. Fallback: treat as a possible node ID
        resolved_nodes.add(ident_up)
    
    return list(resolved_nodes)

def resolve_to_storage_keys(node_ids: list[str]) -> list[str]:
    """Resolves topological IDs (ConnectivityNodes or Equipment) to storage keys (EnergyConsumer names)."""
    ensure_graph_built()
    keys = set()
    for nid in node_ids:
        # Normalize nid to uppercase for lookup
        nid_up = nid.upper()
        
        # 1. Check if the ID is a ConnectivityNode
        consumers = _node_to_energy_consumers.get(nid_up)
        if consumers:
            keys.update(consumers)
            continue
            
        # 2. Check if the ID is an Equipment ID (mRID)
        parent_node = _equipment_to_node.get(nid_up)
        if parent_node:
            consumers = _node_to_energy_consumers.get(parent_node)
            if consumers:
                keys.update(consumers)
            continue
            
        # 3. If it's a direct EnergyConsumer Name (exact case), keep it
        # This handles cases where the ID is already the storage key
        keys.add(nid)

    return list(keys)
