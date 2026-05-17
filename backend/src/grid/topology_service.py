import logging
import time
from typing import List, Dict, Any, Optional, Set
from src.shared.cim_registry import CimModelRegistry
from src.grid.topology_engine import TopologyEngine
from src.grid.graph_node import GraphNode

logger = logging.getLogger(__name__)

class TopologyService:
    """Service for orchestrating graph construction and managing cached topological state."""

    def __init__(self, registry: CimModelRegistry, engine: TopologyEngine):
        self.registry = registry
        self.engine = engine
        
        # State tracking (Moved from dependencies.py)
        self._graph_built_for: Set[str] = set()
        self._cached_nodes: List[Dict] = []
        self._cached_edges: List[Dict] = []
        self._edge_id_to_nodes: Dict[str, List[str]] = {}
        self._equipment_to_node: Dict[str, str] = {}
        self._node_to_equipment_names: Dict[str, List[str]] = {}
        self._node_to_equipment_mrids: Dict[str, List[str]] = {}
        self._node_to_energy_consumers: Dict[str, List[str]] = {}

    def ensure_graph_built(self, model_ids: Optional[List[str]] = None) -> tuple[List[Dict], List[Dict]]:
        """Build the in-memory graph engine from CIM models if requested models have changed."""
        start_total = time.time()
        requested = set(model_ids) if model_ids else set(self.registry.get_active_model_ids())
        
        if requested == self._graph_built_for and self._cached_nodes:
            return self._cached_nodes, self._cached_edges

        logger.info("[TopologyService] Building graph for models: %s", requested)
        
        # 1. Fetch combined topology from registry
        nodes_raw, edges = self.registry.get_combined_topology(list(requested) if model_ids else None)

        # 2. Instantiate GraphNode objects
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

        # 3. Rebuild the engine's internal graph
        self.engine.build_graph(nodes=nodes, edges=edges)
        
        # 4. Update lookup caches
        self._update_lookup_caches(nodes_raw, edges)

        self._graph_built_for = requested
        self._cached_nodes = nodes_raw
        self._cached_edges = edges
        
        logger.info("[TopologyService] total ensure_graph_built took %.2fs", time.time() - start_total)
        return nodes_raw, edges

    def _update_lookup_caches(self, nodes_raw: List[Dict], edges: List[Dict]):
        """Updates internal maps for resolving equipment/edges to nodes."""
        self._edge_id_to_nodes.clear()
        for e in edges:
            eid = e.get("edge_id")
            if eid:
                self._edge_id_to_nodes[eid.upper()] = [e["from_node_id"].upper(), e["to_node_id"].upper()]

        self._equipment_to_node.clear()
        self._node_to_equipment_names.clear()
        self._node_to_equipment_mrids.clear()
        self._node_to_energy_consumers.clear()
        
        for n in nodes_raw:
            nid = n["node_id"].upper()
            names = []
            mrids = []
            consumers = []
            for eq in n.get("attached_equipment", []):
                mrid = eq.get("mrid")
                name = eq.get("name")
                eq_type = eq.get("type")
                
                if mrid:
                    mrid_up = mrid.upper()
                    self._equipment_to_node[mrid_up] = nid
                    mrids.append(mrid_up)
                if name:
                    names.append(name)
                    if eq_type == "EnergyConsumer":
                        consumers.append(name)
            self._node_to_equipment_names[nid] = names
            self._node_to_equipment_mrids[nid] = mrids
            self._node_to_energy_consumers[nid] = consumers

    def resolve_request_ids(self, ids: List[str]) -> List[str]:
        """Resolves a list of IDs (nodes, edges, or equipment) to topological ConnectivityNode IDs."""
        self.ensure_graph_built()
        resolved_nodes = set()
        
        for ident in ids:
            ident_up = ident.upper()
            if ident_up.startswith("URN:UUID:"):
                ident_up = ident_up[9:]
            
            if ident_up in self.engine._nodes:
                resolved_nodes.add(ident_up)
                continue
            
            if ident_up in self._equipment_to_node:
                resolved_nodes.add(self._equipment_to_node[ident_up])
                continue

            if ident_up in self._edge_id_to_nodes:
                resolved_nodes.update(self._edge_id_to_nodes[ident_up])
                continue
                
            resolved_nodes.add(ident_up)
        
        return list(resolved_nodes)

    def resolve_to_storage_keys(self, node_ids: List[str]) -> List[str]:
        """Resolves topological IDs to storage keys (EnergyConsumer names)."""
        self.ensure_graph_built()
        keys = set()
        for nid in node_ids:
            nid_up = nid.upper()
            
            consumers = self._node_to_energy_consumers.get(nid_up)
            if consumers:
                keys.update(consumers)
                continue
                
            parent_node = self._equipment_to_node.get(nid_up)
            if parent_node:
                consumers = self._node_to_energy_consumers.get(parent_node)
                if consumers:
                    keys.update(consumers)
                continue
                
            keys.add(nid)
        return list(keys)
