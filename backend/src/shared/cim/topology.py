"""TopologyBuilder — produces nodes and edges with the redesigned data model.

Equipment is classified as either:
  * ATTACHED  (1-terminal): hangs off a connectivity node, embedded inline.
  * EDGE       (2-terminal): connects two connectivity nodes, becomes a graph edge.

Classification is driven purely by terminal count, not by type-name, making it
robust to unusual wiring in IEEE 8500 and other CIM models.
"""

import logging
import random
from typing import Any

from src.shared.cim.helpers import _mrid_str, _get_name, _safe_float, _parse_phase_code
from src.shared.cim.indexes import IndexBuilder

logger = logging.getLogger(__name__)


class TopologyBuilder:
    """Build topology nodes and edges from pre-computed CIM indexes.

    Node shape::

        {
            "node_id": cn_mrid,
            "node_type": "Bus" | "Substation",
            "name": ...,
            "phases_present": [...],
            "latitude": lat,
            "longitude": lon,
            "base_voltage_kv": None,
            "attached_equipment": [
                {
                    "mrid": ...,
                    "type": "EnergyConsumer" | "EnergySource" | "Capacitor",
                    "name": ...,
                    "phases": [...],
                    # type-specific fields …
                },
                ...
            ],
        }

    Edge shape::

        {
            "edge_id": eq_mrid,
            "edge_type": "ACLineSegment" | "PowerTransformer" | "Breaker" | ...,
            "from_node_id": cn1,
            "to_node_id": cn2,
            "name": ...,
            "phases": [...],
            # Switches only:  "is_open": False,
            # Transformers:   "transformer_kva": None,
            # ACLineSegment:  "length_m": None,
        }
    """

    # ------------------------------------------------------------------
    # Classification Logic (Terminal-count driven)
    # ------------------------------------------------------------------

    def _is_attached(self, eq_mrid: str) -> bool:
        """Attached equipment has exactly 1 terminal."""
        terminals = self.idx.eq_terminals.get(eq_mrid, [])
        return len(terminals) == 1

    def _is_edge(self, eq_mrid: str) -> bool:
        """Edge equipment has at least 2 terminals."""
        terminals = self.idx.eq_terminals.get(eq_mrid, [])
        return len(terminals) >= 2

    def __init__(self, cim, graph, idx: IndexBuilder):
        self.cim = cim
        self.graph = graph
        self.idx = idx
        self._nodes: list[dict] = []
        self._edges: list[dict] = []
        self._node_locations: dict[str, tuple[float, float]] = {} # cn_mrid -> (lat, lon)

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    def build(self):
        """Build nodes and edges from the CIM graph."""
        self._build_nodes()
        self._build_edges()
        logger.info(
            "Topology built: %d nodes, %d edges",
            len(self._nodes),
            len(self._edges),
        )

    @property
    def nodes(self) -> list[dict]:
        return self._nodes

    @property
    def edges(self) -> list[dict]:
        return self._edges

    # ------------------------------------------------------------------
    # Node construction
    # ------------------------------------------------------------------

    def _build_nodes(self):
        cim = self.cim
        graph = self.graph
        idx = self.idx

        connectivity_nodes = graph.get(getattr(cim, "ConnectivityNode", None), {})

        for _cn_id, cn in connectivity_nodes.items():
            cn_mrid = _mrid_str(cn)
            cn_name = _get_name(cn)

            lat, lon = 0.0, 0.0
            node_type = "Bus"
            attached_equipment: list[dict] = []

            # 1. Try ConnectivityNode's own location first
            cn_coord = idx.eq_coords.get(cn_mrid)
            if cn_coord and cn_coord != (0.0, 0.0):
                lat, lon = cn_coord
                best_priority = -1 # Highest priority
            else:
                eq_mrids = idx.cn_equipment.get(cn_mrid, [])
                best_priority = 99

                for eq_mrid in eq_mrids:
                    # Terminal-aware coordinate lookup: use first coord for terminal-1 CN,
                    # last coord for terminal-2 CN, so polyline endpoints map correctly.
                    term_list = idx.eq_terminals.get(eq_mrid, [])
                    if len(term_list) >= 2 and term_list[1][1] == cn_mrid:
                        coord = idx.eq_last_coord.get(eq_mrid)
                    else:
                        coord = idx.eq_first_coord.get(eq_mrid)

                    if coord and coord != (0.0, 0.0):
                        # Coordinate Priority Logic:
                        # -1: Attached equipment (highest, pins node exactly)
                        #  0: Edge with distinct first/last coords (no collapse)
                        #  1: Edge with single coord (potential collapse, lowest priority)
                        is_attached = self._is_attached(eq_mrid)
                        first_c = idx.eq_first_coord.get(eq_mrid)
                        last_c = idx.eq_last_coord.get(eq_mrid)
                        has_multiple_points = (first_c != last_c) if (first_c and last_c) else False

                        if is_attached:
                            priority = -1
                        elif has_multiple_points:
                            priority = 0
                        else:
                            priority = 1

                        if priority < best_priority:
                            lat, lon = coord
                            best_priority = priority

            eq_mrids = idx.cn_equipment.get(cn_mrid, [])
            for eq_mrid in eq_mrids:
                eq_type = idx.equipment_types.get(eq_mrid)

                # Determine attached vs edge by terminal count
                if self._is_attached(eq_mrid):
                    entry = idx.equipment_index.get(eq_mrid)
                    obj = entry[1] if entry else None
                    attached = self._build_attached_dict(eq_mrid, eq_type, obj)
                    attached_equipment.append(attached)

                    if eq_type == "EnergySource":
                        node_type = "Substation"

                # Substation equipment always marks the node as Substation
                if eq_type == "Substation":
                    node_type = "Substation"

            # Check for Substation class objects directly linked to this CN via
            # the ConnectivityNodeContainer hierarchy
            container = getattr(cn, "ConnectivityNodeContainer", None)
            if container and type(container).__name__ == "Substation":
                node_type = "Substation"

            # Phase codes
            phases = self._get_phases_for_cn(cn_mrid) or ["A", "B", "C"]

            # Scatter zero-coordinate nodes so the map still shows something
            if lat == 0.0 and lon == 0.0:
                lat = 34.0522 + (random.random() * 0.1 - 0.05)
                lon = -118.2437 + (random.random() * 0.1 - 0.05)

            # Base voltage from VoltageLevel container
            base_voltage_kv = None
            if container:
                bv = getattr(container, "BaseVoltage", None)
                if bv:
                    base_voltage_kv = _safe_float(getattr(bv, "nominalVoltage", None))

            self._node_locations[cn_mrid] = (lat, lon)
            self._nodes.append({
                "node_id": cn_mrid,
                "node_type": node_type,
                "cim_class": "ConnectivityNode",
                "name": cn_name,
                "phases": phases,
                "latitude": lat,
                "longitude": lon,
                "base_voltage_kv": base_voltage_kv,
                "attached_equipment": attached_equipment,
            })

    # ------------------------------------------------------------------
    # Edge construction
    # ------------------------------------------------------------------

    def _build_edges(self):
        idx = self.idx

        for eq_mrid, term_list in idx.eq_terminals.items():
            if len(term_list) < 2:
                continue

            eq_type = idx.equipment_types.get(eq_mrid)
            
            if not self._is_edge(eq_mrid):
                continue

            cn1 = term_list[0][1]
            cn2 = term_list[1][1]

            # Robust Orientation for Transformers:
            # If we know the primary CN from the index, ensure cn1 is the primary.
            if eq_type in ("PowerTransformer", "Regulator", "TransformerTank"):
                primary_cn = idx.transformer_primary_cn.get(eq_mrid)
                if primary_cn and primary_cn == cn2:
                    # Swap so cn1 is primary (source-side)
                    cn1, cn2 = cn2, cn1
            phases = self._get_phases_for_equipment(eq_mrid) or ["A", "B", "C"]

            entry = idx.equipment_index.get(eq_mrid)
            obj = entry[1] if entry else None

            edge: dict[str, Any] = {
                "edge_id": eq_mrid,
                "edge_type": eq_type,
                "from_node_id": cn1,
                "to_node_id": cn2,
                "name": _get_name(obj) if obj else eq_mrid,
                "phases": phases,
                "phase_count": len([p for p in phases if p in ("A", "B", "C", "S1", "S2")]),
                "is_single_phase": idx.equipment_is_single_phase.get(eq_mrid, False),
            }

            # Source/target positions from equipment's own location
            sp = idx.eq_first_coord.get(eq_mrid)
            tp = idx.eq_last_coord.get(eq_mrid)
            
            # If equipment has a polyline, use its exact endpoints
            if sp and tp and sp != tp:
                edge["sourcePosition"] = [sp[1], sp[0]] # [lon, lat]
                edge["targetPosition"] = [tp[1], tp[0]] # [lon, lat]
            else:
                # Point device or missing coordinates: fall back to node locations
                n1_loc = self._node_locations.get(cn1)
                n2_loc = self._node_locations.get(cn2)
                if n1_loc: edge["sourcePosition"] = [n1_loc[1], n1_loc[0]]
                if n2_loc: edge["targetPosition"] = [n2_loc[1], n2_loc[0]]

            # Switch/breaker state
            if eq_type in ("Breaker", "LoadBreakSwitch", "Fuse", "Disconnector", "Recloser", "Sectionaliser", "Switch"):
                edge["is_open"] = idx.equipment_open.get(eq_mrid, False)

            # Transformer kVA
            if eq_type in ("PowerTransformer", "Regulator", "TransformerTank"):
                edge["transformer_kva"] = idx.transformer_kva.get(eq_mrid)
                if eq_mrid in idx.transformer_tap_changers:
                    edge["ratio_tap_changer"] = idx.transformer_tap_changers[eq_mrid]

            # Line length + polyline waypoints for ALL equipment types
            if obj is not None:
                if eq_type == "ACLineSegment":
                    edge["length_m"] = _safe_float(getattr(obj, "length", None))
                
                polyline = idx.eq_polyline.get(eq_mrid)
                if polyline and len(polyline) >= 2:
                    # Convert (lat, lon) → [lon, lat] for GeoJSON/deck.gl convention
                    edge["waypoints"] = [[lon, lat] for lat, lon in polyline]

            self._edges.append(edge)

    # ------------------------------------------------------------------
    # Attached equipment helpers
    # ------------------------------------------------------------------

    def _build_attached_dict(self, eq_mrid: str, eq_type: str, obj) -> dict:
        """Build the inline dict for a single piece of attached equipment."""
        phases = self._get_phases_for_equipment(eq_mrid)
        result: dict[str, Any] = {
            "mrid": eq_mrid,
            "type": eq_type,
            "name": _get_name(obj) if obj else eq_mrid,
            "phases": phases,
            "phase_count": len([p for p in phases if p in ("A", "B", "C", "S1", "S2")]) if phases else 0,
            "is_single_phase": self.idx.equipment_is_single_phase.get(eq_mrid, False),
        }

        if eq_type == "EnergyConsumer" and obj is not None:
            for attr, key in [("p", "active_power_w"), ("q", "reactive_power_var")]:
                val = _safe_float(getattr(obj, attr, None))
                if val is not None:
                    result[key] = val
            cc = getattr(obj, "customerCount", None)
            if cc is not None:
                try:
                    result["customer_count"] = int(cc)
                except (ValueError, TypeError):
                    pass
            pc = getattr(obj, "phaseConnection", None)
            if pc:
                result["phase_connection"] = str(pc)

        elif eq_type == "EnergySource" and obj is not None:
            for attr, key in [
                ("nominalVoltage", "nominal_voltage_kv"),
                ("voltageMagnitude", "voltage_magnitude"),
                ("voltageAngle", "voltage_angle_deg"),
                ("r", "resistance_ohm"),
                ("x", "reactance_ohm"),
            ]:
                val = _safe_float(getattr(obj, attr, None))
                if val is not None:
                    result[key] = val

        elif eq_type == "Capacitor" and obj is not None:
            for attr, key in [
                ("bPerSection", "b_per_section_S"),
                ("gPerSection", "g_per_section_S"),
                ("nomU", "nominal_voltage_kv"),
                ("normalSections", "normal_sections"),
            ]:
                val = _safe_float(getattr(obj, attr, None))
                if val is not None:
                    result[key] = val

        return result

    # ------------------------------------------------------------------
    # Phase helpers
    # ------------------------------------------------------------------

    def _get_phases_for_cn(self, cn_mrid: str) -> list[str] | None:
        for eq_mrid in self.idx.cn_equipment.get(cn_mrid, []):
            phases = self._get_phases_for_equipment(eq_mrid)
            if phases:
                return phases
        return None

    def _get_phases_for_equipment(self, eq_mrid: str) -> list[str] | None:
        # 1. Per-phase CIM objects — most reliable
        if eq_mrid in self.idx.eq_phases:
            return self.idx.eq_phases[eq_mrid]

        # 2. Terminal.phases (populated in some profiles)
        for term, _ in self.idx.eq_terminals.get(eq_mrid, []):
            phase_code = getattr(term, "phases", None)
            if phase_code:
                parsed = _parse_phase_code(phase_code)
                if parsed:
                    return parsed
        return None
