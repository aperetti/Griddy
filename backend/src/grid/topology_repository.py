import logging
import json
from typing import List, Dict, Any, Optional, Set

logger = logging.getLogger(__name__)

class TopologyRepository:
    """Repository for retrieving and mapping core grid topology data."""

    def __init__(self, registry_instance, engine_instance, display_engine_instance=None):
        self.registry = registry_instance
        self.engine = engine_instance
        self.display_engine = display_engine_instance

    def get_mapped_topology(self, model_ids: Optional[List[str]] = None) -> Dict[str, List[Dict[str, Any]]]:
        """
        Retrieves raw topology from models and maps it to the UI-ready format.
        Includes circuit assignment, coordinate attachment, and rule classification.
        """
        nodes_raw, edges_raw = self.registry.get_combined_topology(model_ids)
        
        # 1. Assign circuit IDs via connected components
        substations = [n['node_id'] for n in nodes_raw if n['node_type'] == 'Substation']
        node_to_circuit = self._calculate_circuits(nodes_raw, substations)

        # 2. Get bulk classification if display engine is available
        classifications = {}
        if self.display_engine:
            # We classify for each active model
            for mid in (model_ids or self.registry.get_active_model_ids()):
                mgr = self.registry.get_manager(mid)
                if mgr:
                    try:
                        classifications.update(self.display_engine.classify_all(mgr))
                    except Exception as e:
                        logger.error("Bulk classification failed for model %s: %s", mid, e)

        # 3. Map Nodes
        node_coords = {}
        mapped_nodes = []
        for n in nodes_raw:
            nid = n['node_id']
            has_coords = n['longitude'] is not None and n['latitude'] is not None
            pos = [n['longitude'], n['latitude']] if has_coords else [0, 0]
            if has_coords:
                node_coords[nid] = pos
                
            node_out = {
                "id": nid,
                "type": n['node_type'],
                "name": n['name'],
                "position": pos,
                "has_coords": has_coords,
                "circuit_id": node_to_circuit.get(nid, "unknown"),
                "phases": n.get('phases_present', ['A', 'B', 'C']),
                "base_voltage_kv": n.get('base_voltage_kv'),
                "attached_equipment": n.get('attached_equipment', []),
                "model_id": n.get('model_id', 'unknown'),
            }
            
            # Attach classification metadata
            # Keys in classifications are uppercase mRIDs
            if nid.upper() in classifications:
                node_out["style"] = classifications[nid.upper()]
            
            mapped_nodes.append(node_out)

        # 4. Map Edges
        mapped_edges = []
        for e in edges_raw:
            eid = e.get('edge_id', f"{e['from_node_id']}-{e['to_node_id']}")
            src = e['from_node_id']
            tgt = e['to_node_id']
            src_pos = node_coords.get(src)
            tgt_pos = node_coords.get(tgt)
            
            edge_out = {
                "id": eid,
                "source": src,
                "target": tgt,
                "sourcePosition": src_pos or [0, 0],
                "targetPosition": tgt_pos or [0, 0],
                "has_coords": src_pos is not None and tgt_pos is not None,
                "circuit_id": node_to_circuit.get(src, "unknown"),
                "phases": e.get('phases'),
                "edge_type": e.get('edge_type'),
                "name": e.get('name', ''),
                "is_open": e.get('is_open', False),
                "transformer_kva": e.get('transformer_kva'),
                "model_id": e.get('model_id', 'unknown'),
                "waypoints": e.get('waypoints'),
            }
            
            if eid.upper() in classifications:
                edge_out["style"] = classifications[eid.upper()]
            
            mapped_edges.append(edge_out)

        return {"nodes": mapped_nodes, "edges": mapped_edges}

    def _calculate_circuits(self, nodes: List[Dict], substations: List[str]) -> Dict[str, str]:
        """Maps each node to a circuit ID based on connectivity to substations."""
        node_to_circuit = {}
        components = self.engine.get_connected_components()

        node_to_comp_idx = {}
        for idx, comp in enumerate(components):
            for node in comp:
                node_to_comp_idx[node] = idx

        comp_to_circuit = {}
        for i, sub_id in enumerate(substations):
            if sub_id in node_to_comp_idx:
                comp_to_circuit[node_to_comp_idx[sub_id]] = f"circuit_{i+1}"

        for comp_idx, circuit_id in comp_to_circuit.items():
            for node in components[comp_idx]:
                node_to_circuit[node] = circuit_id
        
        return node_to_circuit
