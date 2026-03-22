"""IndexBuilder — builds all lookup indexes from a loaded FeederModel."""

import logging
from collections import defaultdict
from pathlib import Path
from typing import Any

from src.shared.cim.helpers import _mrid_str, _get_name, _safe_float, _parse_phase_code
from src.shared.cim.loader import _manual_xml_catalog_scan

logger = logging.getLogger(__name__)


class IndexBuilder:
    """Builds and holds all lookup indexes derived from a CIM FeederModel graph.

    After ``build()`` is called the public index dicts are ready for use by
    ``TopologyBuilder`` and ``CimModelManager``.
    """

    def __init__(self, cim, graph, xml_path: Path | None = None):
        self.cim = cim
        self.graph = graph
        self._xml_path = xml_path

        # Public indexes
        self.equipment_index: dict[str, tuple[str, Any]] = {}     # mRID → (cls_name, obj)
        self.equipment_types: dict[str, str] = {}                  # mRID → type label
        self.equipment_open: dict[str, bool] = {}                  # mRID → open state
        self.eq_coords: dict[str, tuple[float, float]] = {}        # mRID → (lat, lon)
        self.location_coords: dict[str, tuple[float, float]] = {}  # loc mRID → (lat, lon)
        self.eq_terminals: dict[str, list] = defaultdict(list)     # eq mRID → [(term, cn_mRID)]
        self.cn_equipment: dict[str, list] = defaultdict(list)     # cn mRID → [eq mRID]
        self.eq_phases: dict[str, list[str]] = {}                  # eq mRID → ["A","B",…]
        self.transformer_kva: dict[str, float] = {}                # PT/Tank mRID → kVA
        self.transformer_primary_cn: dict[str, str] = {}           # PT mRID → primary CN mRID
        self.transformer_has_tap_changer: dict[str, bool] = {}     # PT/Tank mRID → bool
        self.equipment_is_single_phase: dict[str, bool] = {}       # mRID → bool
        self.equipment_current_limits: dict[str, float] = {}       # mRID → Amps
        self.manual_tank_to_info: dict[str, str] = {}              # tank mRID → tankInfo mRID
        self.manual_info_to_kva: dict[str, float] = {}             # tankInfo mRID → VA

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    def build(self):
        """Orchestrate all index construction."""
        self._index_equipment()
        self._build_coordinate_index()
        self._build_terminal_index()
        self._build_phase_index()
        if self._xml_path is not None:
            self.manual_tank_to_info, self.manual_info_to_kva = _manual_xml_catalog_scan(
                self._xml_path
            )
        self._build_transformer_index()
        self._build_limit_index()
        self._classify_equipment()

    # ------------------------------------------------------------------
    # Private builders
    # ------------------------------------------------------------------

    def _index_equipment(self):
        """Populate equipment_index: mRID → (cls_name, obj) for every CIM object."""
        for cim_cls, objs in self.graph.items():
            cls_name = cim_cls.__name__
            for _eid, obj in objs.items():
                m = _mrid_str(obj)
                if m:
                    self.equipment_index[m] = (cls_name, obj)

    def _build_coordinate_index(self):
        cim = self.cim
        graph = self.graph

        position_points = graph.get(getattr(cim, "PositionPoint", None), {})
        raw_points: list[tuple[float, float]] = []

        for _pp_id, pp in position_points.items():
            x = _safe_float(getattr(pp, "xPosition", None))
            y = _safe_float(getattr(pp, "yPosition", None))
            if x is not None and y is not None:
                raw_points.append((x, y))

        # Normalise into ~0.1° box centred on Los Angeles
        if raw_points:
            min_x = min(p[0] for p in raw_points)
            max_x = max(p[0] for p in raw_points)
            min_y = min(p[1] for p in raw_points)
            max_y = max(p[1] for p in raw_points)
            span_x = (max_x - min_x) or 1.0
            span_y = (max_y - min_y) or 1.0

            def _normalize(x, y):
                lon = (x - min_x) / span_x * 0.1 - 118.2437
                lat = (y - min_y) / span_y * 0.1 + 34.0522
                return lat, lon
        else:
            def _normalize(x, y):
                return 34.0522, -118.2437

        # Location mRID → (lat, lon)
        for _pp_id, pp in position_points.items():
            loc = getattr(pp, "Location", None)
            loc_id = _mrid_str(loc)
            x = _safe_float(getattr(pp, "xPosition", None))
            y = _safe_float(getattr(pp, "yPosition", None))
            if loc_id and x is not None and y is not None:
                if loc_id not in self.location_coords:
                    self.location_coords[loc_id] = _normalize(x, y)

        # Equipment mRID → (lat, lon)
        eq_cls_with_location = []
        for opt in ("ACLineSegment", "PowerTransformer", "Breaker",
                    "LoadBreakSwitch", "EnergyConsumer", "EnergySource",
                    "Fuse", "Disconnector", "Recloser", "Substation",
                    "LinearShuntCompensator", "TransformerTank"):
            cls = getattr(cim, opt, None)
            if cls:
                eq_cls_with_location.append(cls)

        for eq_cls in eq_cls_with_location:
            for _eid, eq in graph.get(eq_cls, {}).items():
                eq_m = _mrid_str(eq)
                loc = getattr(eq, "Location", None)
                loc_id = _mrid_str(loc)
                if eq_m and loc_id and loc_id in self.location_coords:
                    self.eq_coords[eq_m] = self.location_coords[loc_id]

        logger.info(
            "  %d position points → %d locations → %d equipment geocoded",
            len(raw_points),
            len(self.location_coords),
            len(self.eq_coords),
        )

    def _build_terminal_index(self):
        cim = self.cim
        terminals = self.graph.get(getattr(cim, "Terminal", None), {})
        for _tid, term in terminals.items():
            ce = getattr(term, "ConductingEquipment", None)
            cn = getattr(term, "ConnectivityNode", None)
            ce_m = _mrid_str(ce) if ce else None
            cn_m = _mrid_str(cn) if cn else None
            if ce_m and cn_m:
                self.eq_terminals[ce_m].append((term, cn_m))
                self.cn_equipment[cn_m].append(ce_m)

        logger.info(
            "  %d terminals → %d equipment → %d connectivity nodes",
            len(terminals),
            len(self.eq_terminals),
            len(self.cn_equipment),
        )

    def _classify_equipment(self):
        cim = self.cim
        graph = self.graph

        type_map: dict = {}
        for opt_name, type_str in [
            ("ACLineSegment", "ACLineSegment"),
            ("PowerTransformer", "PowerTransformer"),
            ("Breaker", "Breaker"),
            ("LoadBreakSwitch", "LoadBreakSwitch"),
            ("EnergyConsumer", "EnergyConsumer"),
            ("EnergySource", "EnergySource"),
            ("TransformerTank", "PowerTransformer"),
            ("Fuse", "Fuse"),
            ("Disconnector", "Disconnector"),
            ("Recloser", "Recloser"),
            ("LinearShuntCompensator", "Capacitor"),
        ]:
            cls = getattr(cim, opt_name, None)
            if cls:
                type_map[cls] = type_str

        for eq_cls, type_name in type_map.items():
            for _eid, eq in graph.get(eq_cls, {}).items():
                m = _mrid_str(eq)
                if m:
                    self.equipment_types[m] = type_name
                    

                    if type_name in ("Breaker", "LoadBreakSwitch", "Fuse",
                                     "Disconnector", "Recloser"):
                        is_open = getattr(eq, "normalOpen", None) or getattr(eq, "open", None)
                        self.equipment_open[m] = bool(is_open) if is_open is not None else False

        for _sid, sub in graph.get(getattr(cim, "Substation", None), {}).items():
            m = _mrid_str(sub)
            if m:
                self.equipment_types[m] = "Substation"

    def _build_phase_index(self):
        """Build eq_phases: mRID → phase list from per-phase CIM objects.

        CIM stores phases on dedicated association objects rather than on
        Terminal.phases (which is often unpopulated). We scan:
        * ACLineSegmentPhase    → ACLineSegment
        * EnergyConsumerPhase   → EnergyConsumer
        * SwitchPhase           → Switch (Breaker / LoadBreakSwitch etc.)
        * ShuntCompensatorPhase → ShuntCompensator
        """
        cim = self.cim
        graph = self.graph

        phase_class_map: list[tuple] = []
        for cls_name, parent_attr in [
            ("ACLineSegmentPhase",    "ACLineSegment"),
            ("EnergyConsumerPhase",   "EnergyConsumer"),
            ("SwitchPhase",           "Switch"),
            ("ShuntCompensatorPhase", "ShuntCompensator"),
        ]:
            cls = getattr(cim, cls_name, None)
            if cls and graph.get(cls):
                phase_class_map.append((cls, parent_attr))

        for phase_cls, parent_attr in phase_class_map:
            for _pid, ph_obj in graph.get(phase_cls, {}).items():
                parent = getattr(ph_obj, parent_attr, None)
                parent_id = _mrid_str(parent)
                if not parent_id:
                    continue
                pc = getattr(ph_obj, "phase", None)
                if pc is None:
                    continue
                parsed = _parse_phase_code(pc)
                if parsed:
                    existing = self.eq_phases.setdefault(parent_id, [])
                    for p in parsed:
                        if p not in existing:
                            existing.append(p)

        # 2. Transformer Ends (PowerTransformerEnd / TransformerTankEnd)
        # Gather all candidates and pick the one with max voltage or min endNumber
        transformer_candidates: dict[str, list[dict]] = {}

        for cls_name in ["PowerTransformerEnd", "TransformerTankEnd"]:
            cls = getattr(cim, cls_name, None)
            if not cls: continue
            
            for _eid, end in graph.get(cls, {}).items():
                parent = getattr(end, "PowerTransformer", None) or getattr(end, "TransformerTank", None)
                parent_id = _mrid_str(parent)
                if not parent_id: continue
                
                # Get phase code
                ph = getattr(end, "phases", None) or getattr(end, "orderedPhases", None)
                if not ph:
                    term = getattr(end, "Terminal", None)
                    ph = getattr(term, "phases", None) if term else None
                
                if ph:
                    parsed = _parse_phase_code(ph)
                    if parsed:
                        enum = getattr(end, "endNumber", 1)
                        # Identify voltage for priority (max voltage = primary side)
                        voltage = 0.0
                        if cls_name == "PowerTransformerEnd":
                            voltage = _safe_float(getattr(end, "ratedU", 0.0))
                        else: # TransformerTankEnd
                            ti = getattr(parent, "TransformerTankInfo", None)
                            if ti:
                                ti_id = _mrid_str(ti)
                                tei_cls = getattr(cim, "TransformerEndInfo", None)
                                if tei_cls:
                                    for _ei_id, tei in graph.get(tei_cls, {}).items():
                                        ti_p = getattr(tei, "TransformerTankInfo", None)
                                        if ti_p and _mrid_str(ti_p) == ti_id:
                                            if getattr(tei, "endNumber", 0) == enum:
                                                voltage = _safe_float(getattr(tei, "rated_u_kv", 0.0))
                                                break

                        if parent_id not in transformer_candidates:
                            transformer_candidates[parent_id] = []
                        transformer_candidates[parent_id].append({
                            "enum": enum, 
                            "voltage": voltage, 
                            "parsed": parsed, 
                            "cls": cls_name,
                            "parent_obj": parent
                        })

        # Select the best candidate for each transformer
        for pid, candidates in transformer_candidates.items():
            # Best = 1. Highest Voltage, 2. Lowest endNumber
            best = sorted(candidates, key=lambda c: (-c["voltage"], c["enum"]))[0]
            parsed = best["parsed"]
            
            self.eq_phases[pid] = parsed
            
            # If this is a tank, propagate to parent PowerTransformer
            if best["cls"] == "TransformerTankEnd":
                pt = getattr(best["parent_obj"], "PowerTransformer", None)
                pt_m = _mrid_str(pt)
                if pt_m:
                    existing = self.eq_phases.setdefault(pt_m, [])
                    for p in parsed:
                        if p not in existing:
                            existing.append(p)

        _phase_order = {"A": 0, "B": 1, "C": 2, "N": 3, "S1": 4, "S2": 5}
        for phases in self.eq_phases.values():
            phases.sort(key=lambda p: _phase_order.get(p, 9))

        # Identify single-phase units
        for mrid, phases in self.eq_phases.items():
            # Any unit with exactly 1 non-neutral phase is single-phase.
            # (Neutral 'N' doesn't count towards the 'count' for 1-phase vs 3-phase classification)
            active_phases = [p for p in phases if p in ("A", "B", "C", "S1", "S2")]
            if len(active_phases) == 1:
                self.equipment_is_single_phase[mrid] = True
            elif len(active_phases) == 2 and ("S1" in active_phases or "S2" in active_phases):
                # Split-phase is often considered "single phase" in distribution context
                self.equipment_is_single_phase[mrid] = True
            else:
                self.equipment_is_single_phase[mrid] = False

        logger.info(
            "  Equipment phase index: %d equipment with per-phase data (%d single-phase)",
            len(self.eq_phases),
            sum(1 for v in self.equipment_is_single_phase.values() if v)
        )

    def _build_transformer_index(self):
        """Build transformer_kva and transformer_primary_cn indexes with robust fallbacks."""
        cim = self.cim
        graph = self.graph

        # ── 1. PowerTransformerEnd (Transmission/Substation level) ──
        pte_cls = getattr(cim, "PowerTransformerEnd", None)
        if pte_cls:
            for _eid, pte in graph.get(pte_cls, {}).items():
                pt = getattr(pte, "PowerTransformer", None)
                pt_mrid = _mrid_str(pt)
                if pt_mrid:
                    va = _safe_float(getattr(pte, "ratedS", None))
                    if va:
                        current = self.transformer_kva.get(pt_mrid, 0.0)
                        self.transformer_kva[pt_mrid] = max(current, va / 1000.0)

                    if getattr(pte, "endNumber", None) == 1:
                        term = getattr(pte, "Terminal", None)
                        if term:
                            cn = getattr(term, "ConnectivityNode", None)
                            cn_m = _mrid_str(cn)
                            if cn_m:
                                self.transformer_primary_cn[pt_mrid] = cn_m

        # ── 2. TransformerTankEnd (Distribution level) ──
        tte_cls = getattr(cim, "TransformerTankEnd", None)
        if tte_cls:
            for _eid, tte in graph.get(tte_cls, {}).items():
                tank = getattr(tte, "TransformerTank", None)
                tank_id = _mrid_str(tank)
                if tank_id:
                    ei = getattr(tte, "TransformerEndInfo", None)
                    if ei:
                        va = _safe_float(getattr(ei, "ratedS", None))
                        if va:
                            current = self.transformer_kva.get(tank_id, 0.0)
                            self.transformer_kva[tank_id] = max(current, va / 1000.0)

                    if getattr(tte, "endNumber", None) == 1:
                        term = getattr(tte, "Terminal", None)
                        if term:
                            cn = getattr(term, "ConnectivityNode", None)
                            cn_m = _mrid_str(cn)
                            if cn_m:
                                self.transformer_primary_cn[tank_id] = cn_m
                                pt = getattr(tank, "PowerTransformer", None)
                                pt_id = _mrid_str(pt)
                                if pt_id:
                                    self.transformer_primary_cn[pt_id] = cn_m

        # ── 3. Propagate Tank ratings to parent PowerTransformer ──
        tt_cls = getattr(cim, "TransformerTank", None)
        if tt_cls:
            for _id, t in graph.get(tt_cls, {}).items():
                t_id = _mrid_str(t)
                kva = self.transformer_kva.get(t_id)
                if kva:
                    pt = getattr(t, "PowerTransformer", None)
                    pt_id = _mrid_str(pt)
                    if pt_id:
                        current = self.transformer_kva.get(pt_id, 0.0)
                        self.transformer_kva[pt_id] = max(current, kva)

        # ── 3b. Tap Changer identification (Regulators) ──
        rtc_cls = getattr(cim, "RatioTapChanger", None)
        if rtc_cls:
            for _eid, rtc in graph.get(rtc_cls, {}).items():
                # RatioTapChanger can be linked to PowerTransformerEnd or TransformerTankEnd
                pte = getattr(rtc, "TransformerEnd", None) # Often just "TransformerEnd" in CIM
                if pte:
                    # PowerTransformerEnd -> PowerTransformer
                    pt = getattr(pte, "PowerTransformer", None)
                    pt_id = _mrid_str(pt)
                    if pt_id:
                        self.transformer_has_tap_changer[pt_id] = True
                    
                    # TransformerTankEnd -> TransformerTank
                    tank = getattr(pte, "TransformerTank", None)
                    tank_id = _mrid_str(tank)
                    if tank_id:
                        self.transformer_has_tap_changer[tank_id] = True
                        # Also flag the parent transformer if it's a tank
                        pt_from_tank = getattr(tank, "PowerTransformer", None)
                        pt_from_tank_id = _mrid_str(pt_from_tank)
                        if pt_from_tank_id:
                            self.transformer_has_tap_changer[pt_from_tank_id] = True
                    
    def _build_limit_index(self):
        """Map equipment to their associated CurrentLimit values."""
        cim = self.cim
        graph = self.graph
        
        limit_set_cls = getattr(cim, "OperationalLimitSet", None)
        current_limit_cls = getattr(cim, "CurrentLimit", None)
        
        if not limit_set_cls or not current_limit_cls:
            return
            
        # CIM relationship: CurrentLimit -> OperationalLimitSet -> Equipment/Terminal
        for _lid, cl in graph.get(current_limit_cls, {}).items():
            val = _safe_float(getattr(cl, "value", None))
            if val is None:
                continue
                
            lset = getattr(cl, "OperationalLimitSet", None)
            if not lset:
                continue
                
            # Check direct Equipment link
            eq = getattr(lset, "Equipment", None)
            eq_id = _mrid_str(eq)
            if eq_id:
                # Store the limit (taking first found or could implement preference logic)
                if eq_id not in self.equipment_current_limits:
                    self.equipment_current_limits[eq_id] = val
                continue
                
            # Check Terminal link (ConductingEquipment -> Terminal -> OperationalLimitSet)
            term = getattr(lset, "Terminal", None)
            if term:
                eq = getattr(term, "ConductingEquipment", None)
                eq_id = _mrid_str(eq)
                if eq_id:
                    if eq_id not in self.equipment_current_limits:
                        self.equipment_current_limits[eq_id] = val

        # ── 4. Fallback: Manual XML Scan results ──
        tank_count = 0
        for tank_mrid, info_mrid in self.manual_tank_to_info.items():
            if self.transformer_kva.get(tank_mrid, 0.0) == 0.0:
                kva = self.manual_info_to_kva.get(info_mrid)
                if kva:
                    val = kva / 1000.0
                    self.transformer_kva[tank_mrid] = val
                    tank_count += 1

                    tank_obj_tuple = self.equipment_index.get(tank_mrid)
                    if tank_obj_tuple:
                        tank_obj = tank_obj_tuple[1]
                        pt = getattr(tank_obj, "PowerTransformer", None)
                        pt_id = _mrid_str(pt)
                        if pt_id:
                            self.transformer_kva[pt_id] = max(
                                self.transformer_kva.get(pt_id, 0.0), val
                            )

        # Fallback for PowerTransformerInfo linked directly to PowerTransformer
        # (models that don't use Tanks for substation transformers)
        pt_cls = getattr(cim, "PowerTransformer", None)
        if pt_cls:
            for _pid, pt in graph.get(pt_cls, {}).items():
                pt_id = _mrid_str(pt)
                if pt_id and self.transformer_kva.get(pt_id, 0.0) == 0.0:
                    pti = getattr(pt, "PowerTransformerInfo", None)
                    pti_id = _mrid_str(pti)
                    if pti_id:
                        kva = self.manual_info_to_kva.get(pti_id)
                        if kva:
                            self.transformer_kva[pt_id] = kva / 1000.0
                            tank_count += 1

        logger.info(
            "  Transformer KVA index: %d transformers rated (%d from manual scan fallback)",
            len(self.transformer_kva),
            tank_count,
        )
