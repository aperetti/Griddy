"""EquipmentEnricher — type-specific detail enrichment for CIM equipment.

Responsible for:
* Extracting primitive properties from any CIM dataclass object.
* Enriching equipment detail dicts with type-specific fields (impedance,
  winding data, switch state, etc.).
* Building asset hierarchy trees (Equipment → Asset → AssetInfo).

All methods are pure functions over the CIM graph — no I/O, no Neo4j calls.
Receives ``cim``, ``graph``, and ``idx`` at construction time from CimModelManager.
"""

import logging
from typing import Any

from src.shared.cim.helpers import _mrid_str, _get_name, _safe_float, _parse_phase_code

logger = logging.getLogger(__name__)


class EquipmentEnricher:
    """Stateless enrichment helpers bound to a specific loaded CIM graph."""

    def __init__(self, cim: Any, graph: dict, idx: Any) -> None:
        self.cim = cim
        self.graph = graph
        self.idx = idx

    # ── Primitive extraction ──────────────────────────────────────────────────

    def extract_primitives(self, obj: Any) -> dict:
        """Extract all primitive properties from any CIM dataclass object."""
        detail: dict[str, Any] = {
            "mrid": _mrid_str(obj),
            "name": _get_name(obj),
        }

        if hasattr(obj, "__dataclass_fields__"):
            for attr in obj.__dataclass_fields__.keys():
                if attr in ("mRID", "name", "identifier", "aliasName", "description"):
                    continue
                val = getattr(obj, attr, None)
                if val is not None:
                    if attr == "ratedS" and isinstance(val, (int, float)):
                        detail["sapparent_kva"] = float(val) / 1000.0
                        continue
                    if attr == "ratedU" and isinstance(val, (int, float)):
                        detail["rated_u_kv"] = float(val) / 1000.0
                        continue
                    if isinstance(val, (str, int, float, bool)):
                        detail[attr] = val
                    elif hasattr(val, "value"):
                        detail[attr] = str(val.value)
        else:
            detail["endNumber"] = getattr(obj, "endNumber", None)
            for attr in ["ratedS", "ratedU", "r", "x", "connectionKind"]:
                val = getattr(obj, attr, None)
                if val is not None:
                    if attr == "ratedS" and isinstance(val, (int, float)):
                        detail["sapparent_kva"] = float(val) / 1000.0
                    elif attr == "ratedU" and isinstance(val, (int, float)):
                        detail["rated_u_kv"] = float(val) / 1000.0
                    else:
                        detail[attr] = str(val.value) if hasattr(val, "value") else val

        return detail

    # ── Type-specific enrichers ───────────────────────────────────────────────

    def enrich_line_segment(self, detail: dict, obj: Any) -> None:
        """ACLineSegment: impedance, length, conductor info."""
        for attr, key in [
            ("length", "length_m"),
            ("r", "resistance_ohm"),
            ("x", "reactance_ohm"),
            ("r0", "zero_seq_resistance_ohm"),
            ("x0", "zero_seq_reactance_ohm"),
            ("bch", "susceptance_S"),
            ("gch", "conductance_S"),
            ("ratedCurrent", "rated_current_a"),
        ]:
            val = _safe_float(getattr(obj, attr, None))
            if val is not None:
                detail[key] = val

        pli = getattr(obj, "PerLengthImpedance", None)
        if pli:
            detail["per_length_impedance"] = {
                "mrid": _mrid_str(pli),
                "name": _get_name(pli),
            }

    def enrich_transformer(self, detail: dict, obj: Any) -> None:
        """PowerTransformer: winding data, tap changer, regulator detection."""
        cim = self.cim
        graph = self.graph

        ends: list[dict] = []
        hierarchy: dict[str, Any] = {
            "mrid": detail["mrid"],
            "name": detail.get("name"),
            "class": "PowerTransformer",
        }

        def _add_to_node(node: dict, child: dict) -> None:
            cls = child.get("class", "Unknown").lower()
            if cls not in node:
                node[cls] = []
            node[cls].append(child)

        # 1. PowerTransformerEnd (Transmission/Substation level)
        pte_cls = getattr(cim, "PowerTransformerEnd", None)
        if pte_cls:
            for _eid, pte in graph.get(pte_cls, {}).items():
                pt = getattr(pte, "PowerTransformer", None)
                if pt and _mrid_str(pt) == detail["mrid"]:
                    end_data = self.extract_primitives(pte)
                    ends.append(end_data)
                    _add_to_node(hierarchy, {"class": "PowerTransformerEnd", **end_data})

        # 2. TransformerTank (Distribution level)
        tt_cls = getattr(cim, "TransformerTank", None)
        if tt_cls:
            for _eid, tank in graph.get(tt_cls, {}).items():
                pt = getattr(tank, "PowerTransformer", None)
                if pt and _mrid_str(pt) == detail["mrid"]:
                    tank_data = self.extract_primitives(tank)
                    tank_node: dict[str, Any] = {"class": "TransformerTank", **tank_data}

                    ti = getattr(tank, "TransformerTankInfo", None)
                    if ti:
                        ti_data = self.extract_primitives(ti)
                        ti_mrid = _mrid_str(ti)
                        _add_to_node(tank_node, {"class": "TransformerTankInfo", **ti_data})

                        ei_cls = getattr(cim, "TransformerEndInfo", None)
                        if ei_cls and ti_mrid:
                            for _ei_id, ei in graph.get(ei_cls, {}).items():
                                ei_ti = getattr(ei, "TransformerTankInfo", None)
                                if ei_ti and _mrid_str(ei_ti) == ti_mrid:
                                    info_data = self.extract_primitives(ei)
                                    if not ends:
                                        ends.append(info_data)
                                    _add_to_node(tank_node, {"class": "TransformerEndInfo", **info_data})

                    tte_cls = getattr(cim, "TransformerTankEnd", None)
                    if tte_cls:
                        for _eeid, tte in graph.get(tte_cls, {}).items():
                            tt_p = getattr(tte, "TransformerTank", None)
                            if tt_p and _mrid_str(tt_p) == tank_node["mrid"]:
                                tte_data = self.extract_primitives(tte)
                                tte_node: dict[str, Any] = {"class": "TransformerTankEnd", **tte_data}

                                enum = getattr(tte, "endNumber", None)
                                if ti and enum:
                                    ei_cls = getattr(cim, "TransformerEndInfo", None)
                                    if ei_cls:
                                        for _eiid, tei in graph.get(ei_cls, {}).items():
                                            ti_p = getattr(tei, "TransformerTankInfo", None)
                                            if ti_p and _mrid_str(ti_p) == _mrid_str(ti):
                                                if getattr(tei, "endNumber", None) == enum:
                                                    ei_data = self.extract_primitives(tei)
                                                    _add_to_node(tte_node, {"class": "TransformerEndInfo", **ei_data})

                                _add_to_node(tank_node, tte_node)

                    _add_to_node(hierarchy, tank_node)

        detail["hierarchy"] = hierarchy
        detail["transformerends"] = sorted(ends, key=lambda e: e.get("endNumber") or 0)

        # ── Regulator detection ───────────────────────────────────────────────
        is_regulator = False

        all_rated_u: list[float] = []
        for end in ends:
            v = _safe_float(end.get("ratedU"))
            if v:
                all_rated_u.append(v)

        def _collect_u(node: dict) -> None:
            if node.get("class") == "TransformerEndInfo":
                v = _safe_float(node.get("ratedU"))
                if v:
                    all_rated_u.append(v)
            for child in node.get("children", []):
                _collect_u(child)

        _collect_u(hierarchy)

        has_1to1 = len(all_rated_u) >= 2 and len(set(all_rated_u)) == 1
        name_lower = (detail.get("name") or "").lower()
        is_named_reg = any(x in name_lower for x in ["reg", "regulator", "vreg"])

        rtc_cls = getattr(cim, "RatioTapChanger", None)
        tcc_cls = getattr(cim, "TapChangerControl", None)

        if rtc_cls:
            parent_transformer_ends: list[str] = []
            tank_mrids: list[str] = []

            def _collect_tanks(node: dict) -> None:
                if node.get("class") == "TransformerTank":
                    tank_mrids.append(node["mrid"])
                for child in node.get("children", []):
                    _collect_tanks(child)

            _collect_tanks(hierarchy)

            pte_cls = getattr(cim, "PowerTransformerEnd", None)
            if pte_cls:
                for _peid, pte in graph.get(pte_cls, {}).items():
                    pt_p = getattr(pte, "PowerTransformer", None)
                    if pt_p and _mrid_str(pt_p) == detail["mrid"]:
                        parent_transformer_ends.append(_mrid_str(pte))

            for _rid, rtc in graph.get(rtc_cls, {}).items():
                te = getattr(rtc, "TransformerEnd", None)
                found = False
                if te:
                    te_mrid = _mrid_str(te)
                    if te_mrid in parent_transformer_ends:
                        found = True
                    else:
                        tte_cls = getattr(cim, "TransformerTankEnd", None)
                        if tte_cls:
                            for _tteid, tte in graph.get(tte_cls, {}).items():
                                if _mrid_str(tte) == te_mrid:
                                    tt_p = getattr(tte, "TransformerTank", None)
                                    if tt_p and _mrid_str(tt_p) in tank_mrids:
                                        found = True
                                        break

                if found:
                    detail["RatioTapChanger"] = self.extract_primitives(rtc)
                    if tcc_cls:
                        for _tcid, tcc in graph.get(tcc_cls, {}).items():
                            tc_ref = getattr(tcc, "TapChanger", None)
                            if tc_ref and _mrid_str(tc_ref) == _rid:
                                detail["TapChangerControl"] = self.extract_primitives(tcc)
                                is_regulator = True
                                rc_ref = getattr(tcc, "RegulatingControl", None)
                                if rc_ref:
                                    detail["RegulatingControl"] = self.extract_primitives(rc_ref)
                                break
                    break

        if is_regulator or (has_1to1 and detail.get("RatioTapChanger")) or is_named_reg:
            detail["display_class"] = "Regulator"

        ptc_cls = getattr(cim, "PhaseTapChanger", None)
        if ptc_cls:
            winding_mrids = {w["mrid"] for w in ends if w.get("mrid")}
            for _rid, ptc in graph.get(ptc_cls, {}).items():
                te = getattr(ptc, "TransformerEnd", None)
                if te and _mrid_str(te) in winding_mrids:
                    detail["PhaseTapChanger"] = self.extract_primitives(ptc)
                    break

    def enrich_switch(self, detail: dict, obj: Any) -> None:
        """Breaker / LoadBreakSwitch / Fuse / Disconnector / Recloser."""
        detail["normal_open"] = bool(getattr(obj, "normalOpen", False))
        detail["open"] = bool(getattr(obj, "open", False))
        val = _safe_float(getattr(obj, "ratedCurrent", None))
        if val is not None:
            detail["rated_current_a"] = val

        limit = self.idx.equipment_current_limits.get(_mrid_str(obj))
        if limit is not None:
            detail["current_limit_a"] = limit

        val = _safe_float(getattr(obj, "breakingCapacity", None))
        if val is not None:
            detail["breaking_capacity"] = val

        detail["hierarchy"] = self.build_asset_hierarchy(detail, obj)

    def enrich_energy_consumer(self, detail: dict, obj: Any) -> None:
        """EnergyConsumer (load / meter)."""
        for attr, key in [("p", "active_power_w"), ("q", "reactive_power_var")]:
            val = _safe_float(getattr(obj, attr, None))
            if val is not None:
                detail[key] = val

        cc = getattr(obj, "customerCount", None)
        if cc is not None:
            try:
                detail["customer_count"] = int(cc)
            except (ValueError, TypeError):
                pass

        pc = getattr(obj, "phaseConnection", None)
        if pc:
            detail["phase_connection"] = str(pc)

        detail["hierarchy"] = self.build_asset_hierarchy(detail, obj)

    def enrich_energy_source(self, detail: dict, obj: Any) -> None:
        """EnergySource (substation source)."""
        for attr, key in [
            ("nominalVoltage", "nominal_voltage_kv"),
            ("voltageMagnitude", "voltage_magnitude"),
            ("voltageAngle", "voltage_angle_deg"),
            ("r", "resistance_ohm"),
            ("x", "reactance_ohm"),
            ("r0", "zero_seq_resistance_ohm"),
            ("x0", "zero_seq_reactance_ohm"),
        ]:
            val = _safe_float(getattr(obj, attr, None))
            if val is not None:
                detail[key] = val

        detail["hierarchy"] = self.build_asset_hierarchy(detail, obj)

    def enrich_capacitor(self, detail: dict, obj: Any) -> None:
        """LinearShuntCompensator (capacitor bank)."""
        for attr, key in [
            ("bPerSection", "b_per_section_S"),
            ("gPerSection", "g_per_section_S"),
            ("nomU", "nominal_voltage_kv"),
            ("normalSections", "normal_sections"),
            ("maximumSections", "maximum_sections"),
        ]:
            val = _safe_float(getattr(obj, attr, None))
            if val is not None:
                detail[key] = val

        detail["hierarchy"] = self.build_asset_hierarchy(detail, obj)

    def enrich_generation(self, detail: dict, obj: Any) -> None:
        """PhotovoltaicUnit / BatteryUnit / SynchronousMachine / PowerElectronicsConnection."""
        # Common power attributes across different generation/storage classes
        for attr, key in [
            ("p", "active_power_w"),
            ("q", "reactive_power_var"),
            ("maxP", "max_p_w"),
            ("minP", "min_p_w"),
            ("ratedS", "rated_s_va"),
            ("ratedU", "rated_u_v"),
            ("ratedE", "rated_e_wh"),
            ("storedE", "stored_e_wh"),
        ]:
            val = _safe_float(getattr(obj, attr, None))
            if val is not None:
                detail[key] = val

        # Handle Battery specifics
        if hasattr(obj, "BatteryUnit"):
            detail["is_battery"] = True

        detail["hierarchy"] = self.build_asset_hierarchy(detail, obj)

    # ── Asset hierarchy ───────────────────────────────────────────────────────

    def build_asset_hierarchy(self, detail: dict, obj: Any) -> dict:
        """Build Equipment → Asset → AssetInfo hierarchy tree."""
        hierarchy: dict[str, Any] = {
            "mrid": detail["mrid"],
            "name": detail.get("name"),
            "class": detail.get("cim_class", type(obj).__name__),
            **detail,
        }

        def _add_to_node(node: dict, child: dict) -> None:
            cls = child.get("class", "Unknown").lower()
            if cls not in node:
                node[cls] = []
            node[cls].append(child)

        asset_cls = getattr(self.cim, "Asset", None)
        if asset_cls:
            for _eid, asset in self.graph.get(asset_cls, {}).items():
                psr = getattr(asset, "PowerSystemResource", None)
                if psr and _mrid_str(psr) == detail["mrid"]:
                    asset_data = self.extract_primitives(asset)
                    asset_node: dict[str, Any] = {"class": "Asset", **asset_data}

                    ai = getattr(asset, "AssetInfo", None)
                    if ai:
                        ai_data = self.extract_primitives(ai)
                        _add_to_node(asset_node, {"class": "AssetInfo", **ai_data})

                    _add_to_node(hierarchy, asset_node)

        return hierarchy
