import logging
from typing import List, Dict, Any, Optional, Set

logger = logging.getLogger(__name__)

class TopologyRepository:
    """Repository for retrieving and mapping core grid topology data."""

    def __init__(self, registry_instance, engine_instance):
        self.registry = registry_instance
        self.engine = engine_instance

    def get_mapped_topology(self, model_ids: Optional[List[str]] = None) -> Dict[str, List[Dict[str, Any]]]:
        """
        Retrieves raw topology from models and maps it to the UI-ready format.
        Includes circuit assignment and coordinate attachment.
        """
        nodes_raw, edges_raw = self.registry.get_combined_topology(model_ids)
        
        # 1. Assign circuit IDs via connected components
        substations = [n['node_id'] for n in nodes_raw if n['node_type'] == 'Substation']
        node_to_circuit = self._calculate_circuits(nodes_raw, substations)

        # 2. Map Nodes
        node_coords = {}
        mapped_nodes = []
        for n in nodes_raw:
            has_coords = n['longitude'] is not None and n['latitude'] is not None
            pos = [n['longitude'], n['latitude']] if has_coords else [0, 0]
            if has_coords:
                node_coords[n['node_id']] = pos
                
            mapped_nodes.append({
                "id": n['node_id'],
                "type": n['node_type'],
                "name": n['name'],
                "position": pos,
                "has_coords": has_coords,
                "circuit_id": node_to_circuit.get(n['node_id'], "unknown"),
                "phases": n.get('phases_present', ['A', 'B', 'C']),
                "base_voltage_kv": n.get('base_voltage_kv'),
                "attached_equipment": n.get('attached_equipment', []),
                "model_id": n.get('model_id', 'unknown'),
            })

        # 3. Map Edges
        mapped_edges = []
        for e in edges_raw:
            src = e['from_node_id']
            tgt = e['to_node_id']
            src_pos = node_coords.get(src)
            tgt_pos = node_coords.get(tgt)
            mapped_edges.append({
                "id": e.get('edge_id', f"{src}-{tgt}"),
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
            })

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
