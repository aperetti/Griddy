"""EquipmentDetailService — CIM equipment detail lookups.

Assembles rich detail dicts for individual equipment items and connectivity nodes
by combining index lookups with type-specific enrichment from ``EquipmentEnricher``.
"""

import logging
from typing import Any

from src.shared.cim.helpers import _mrid_str, _get_name, _safe_float, _parse_phase_code
from src.shared.cim.equipment_enricher import EquipmentEnricher

logger = logging.getLogger(__name__)


class EquipmentDetailService:
    """Assembles equipment detail dicts from CIM indexes and enrichers."""

    def __init__(self, idx: Any, graph: dict, cim: Any, enricher: EquipmentEnricher) -> None:
        self._idx = idx
        self._graph = graph
        self._cim = cim
        self._enricher = enricher

    # ── Public API ────────────────────────────────────────────────────────────

    def get_equipment_detail(self, mrid: str) -> dict | None:
        """Full CIM detail for any equipment by mRID."""
        if self._idx is None:
            return None

        entry = self._idx.equipment_index.get(mrid)
        if not entry:
            return None

        cls_name, obj = entry
        detail: dict[str, Any] = {
            "mrid": mrid,
            "cim_class": cls_name,
            "name": _get_name(obj),
        }

        for attr in ("description", "aliasName"):
            val = getattr(obj, attr, None)
            if val:
                detail[attr] = str(val)

        from src.shared.cim.mapping import apply_mappings
        detail.update(apply_mappings(obj))

        if mrid in self._idx.eq_coords:
            detail["latitude"], detail["longitude"] = self._idx.eq_coords[mrid]

        bv = getattr(obj, "BaseVoltage", None)
        if bv:
            detail["base_voltage_kv"] = _safe_float(getattr(bv, "nominalVoltage", None))

        container = getattr(obj, "EquipmentContainer", None)
        if container:
            detail["container"] = {
                "mrid": _mrid_str(container),
                "name": _get_name(container),
                "class": type(container).__name__,
            }

        terms = self._idx.eq_terminals.get(mrid, [])
        detail["terminals"] = [
            {
                "connectivity_node": cn_m,
                "phases": _parse_phase_code(getattr(t, "phases", None)),
            }
            for t, cn_m in terms
        ]

        enrichers = {
            "ACLineSegment":          self._enricher.enrich_line_segment,
            "PowerTransformer":       self._enricher.enrich_transformer,
            "Breaker":                self._enricher.enrich_switch,
            "LoadBreakSwitch":        self._enricher.enrich_switch,
            "Fuse":                   self._enricher.enrich_switch,
            "Disconnector":           self._enricher.enrich_switch,
            "Recloser":               self._enricher.enrich_switch,
            "EnergyConsumer":         self._enricher.enrich_energy_consumer,
            "EnergySource":           self._enricher.enrich_energy_source,
            "LinearShuntCompensator": self._enricher.enrich_capacitor,
            "PhotovoltaicUnit":       self._enricher.enrich_generation,
            "BatteryUnit":            self._enricher.enrich_generation,
            "SynchronousMachine":     self._enricher.enrich_generation,
            "PowerElectronicsConnection": self._enricher.enrich_generation,
        }
        enricher_fn = enrichers.get(cls_name)
        if enricher_fn:
            enricher_fn(detail, obj)

        if cls_name == "Fuse":
            detail["is_fuse"] = True
        elif cls_name == "Recloser":
            detail["is_recloser"] = True
        elif cls_name == "Disconnector":
            detail["is_disconnector"] = True

        return detail

    def get_node_cim_details(self, node_id: str) -> dict | None:
        """Enriched CIM details for a connectivity node and its attached equipment."""
        if self._idx is None:
            return None

        cim = self._cim
        cn_obj = None
        cn_cls = getattr(cim, "ConnectivityNode", None)
        for _cid, cn in self._graph.get(cn_cls, {}).items():
            if _mrid_str(cn) == node_id:
                cn_obj = cn
                break

        if cn_obj is None:
            return None

        result: dict[str, Any] = {
            "node_id": node_id,
            "name": _get_name(cn_obj),
            "connected_equipment": [],
        }

        container = getattr(cn_obj, "ConnectivityNodeContainer", None)
        if container:
            result["container"] = {
                "mrid": _mrid_str(container),
                "name": _get_name(container),
                "class": type(container).__name__,
            }
            bv = getattr(container, "BaseVoltage", None)
            if bv:
                result["base_voltage_kv"] = _safe_float(getattr(bv, "nominalVoltage", None))

        for eq_mrid in self._idx.cn_equipment.get(node_id, []):
            eq_detail = self.get_equipment_detail(eq_mrid)
            if eq_detail:
                result["connected_equipment"].append(eq_detail)

        return result

    def get_equipment_detail_expanded(self, mrid: str) -> dict | None:
        """Equipment detail with terminal connectivity nodes expanded to full objects."""
        detail = self.get_equipment_detail(mrid)
        if not detail:
            return None

        expanded_terminals = []
        for terminal in detail.get("terminals", []):
            cn_mrid = terminal.get("connectivity_node")
            if cn_mrid and isinstance(cn_mrid, str):
                cn_detail = self.get_node_cim_details(cn_mrid)
                expanded_terminals.append({
                    **terminal,
                    "connectivity_node": cn_detail if cn_detail else cn_mrid,
                })
            else:
                expanded_terminals.append(terminal)

        detail["terminals"] = expanded_terminals
        return detail
