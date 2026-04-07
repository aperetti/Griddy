"""IndexBuilder — builds all lookup indexes from a loaded FeederModel."""

import logging
from collections import defaultdict
from typing import Any

from src.shared.cim.helpers import _mrid_str, _get_name, _safe_float, _parse_phase_code
logger = logging.getLogger(__name__)


class IndexBuilder:
    """Builds and holds all lookup indexes derived from a CIM FeederModel graph.

    After ``build()`` is called the public index dicts are ready for use by
    ``TopologyBuilder`` and ``CimModelManager``.
    """

    def __init__(self, cim, graph, feeder_uri: str | None = None):
        self.cim = cim
        self.graph = graph
        self._feeder_uri = feeder_uri

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
        self.transformer_tap_changers: dict[str, dict] = {}        # PT/Tank mRID → dict of attributes

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    def build(self):
        """Orchestrate all index construction."""
        self._index_equipment()
        self._build_coordinate_index_neo4j()
        self._build_terminal_index()
        self._build_phase_index()
        self._build_transformer_index()
        self._build_limit_index()
        self._classify_equipment()
        
        logger.info("IndexBuilder stats:")
        logger.info(f"  Tap changers documented: {len(self.transformer_has_tap_changer)}")
        regulators = [m for m, t in self.equipment_types.items() if t == "Regulator"]
        logger.info(f"  Regulators classified: {len(regulators)}")

        # Write to a debug file so I can verify background execution
        try:
            import json
            debug_info = {
                "tap_changers": len(self.transformer_has_tap_changer),
                "regulators": len(regulators),
                "model_id": getattr(self.graph, "feeder_mrid", "unknown")
            }
            with open("tmp/index_build_last.json", "w") as f:
                json.dump(debug_info, f)
        except Exception as e:
            logger.error(f"Failed to write debug file: {e}")

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

    def _build_coordinate_index_neo4j(self):
        """Build eq_coords directly from Neo4j.

        cimgraph stores Location as a plain UUID string on equipment objects
        (expand_graph=False) and never adds Location/PositionPoint to the graph,
        so the old graph-traversal approach always produced zero coordinates.
        This method bypasses cimgraph and queries Neo4j directly.
        """
        import os
        from neo4j import GraphDatabase

        neo4j_url = os.getenv("CIMG_URL")
        if not neo4j_url or not self._feeder_uri:
            logger.warning("Skipping coordinate index — CIMG_URL or feeder_uri not set.")
            return

        username = os.getenv("CIMG_USERNAME", "neo4j")
        password = os.getenv("CIMG_PASSWORD", "")
        database = os.getenv("CIMG_DATABASE", "neo4j")

        query = """
MATCH (f:Feeder {uri: $feeder_uri})
MATCH (eq)-[:`Equipment.EquipmentContainer`]->(f)
MATCH (eq)-[:`PowerSystemResource.Location`]->(loc:Location)
MATCH (pp:PositionPoint)-[:`PositionPoint.Location`]->(loc)
RETURN
    REPLACE(eq.uri, 'urn:uuid:', '') AS eq_mrid,
    REPLACE(loc.uri, 'urn:uuid:', '') AS loc_mrid,
    pp.`PositionPoint.xPosition` AS x,
    pp.`PositionPoint.yPosition` AS y
"""
        try:
            driver = GraphDatabase.driver(neo4j_url, auth=(username, password))
            with driver.session(database=database) as session:
                rows = list(session.run(query, feeder_uri=f"urn:uuid:{self._feeder_uri}"))
            driver.close()
        except Exception as e:
            logger.error("Coordinate query failed: %s", e)
            return

        raw_points: list[tuple[float, float]] = []
        for row in rows:
            x = _safe_float(row["x"])
            y = _safe_float(row["y"])
            if x is not None and y is not None:
                raw_points.append((x, y))

        if not raw_points:
            logger.warning("No PositionPoints found for feeder %s", self._feeder_uri)
            return

        # Detect if already geographic (CIM: x=longitude, y=latitude)
        xs = [p[0] for p in raw_points]
        ys = [p[1] for p in raw_points]
        is_geographic = (
            all(-180.0 <= v <= 180.0 for v in xs) and
            all(-90.0 <= v <= 90.0 for v in ys)
        )

        if is_geographic:
            def _to_latlon(x, y): return float(y), float(x)
        else:
            min_x, max_x = min(xs), max(xs)
            min_y, max_y = min(ys), max(ys)
            span_x = (max_x - min_x) or 1.0
            span_y = (max_y - min_y) or 1.0
            def _to_latlon(x, y):
                lon = (x - min_x) / span_x * 0.1 - 118.2437
                lat = (y - min_y) / span_y * 0.1 + 34.0522
                return lat, lon

        # Populate both location_coords and eq_coords in one pass
        for row in rows:
            x = _safe_float(row["x"])
            y = _safe_float(row["y"])
            eq_mrid = (row["eq_mrid"] or "").upper()
            loc_mrid = (row["loc_mrid"] or "").upper()
            if x is None or y is None or not eq_mrid:
                continue
            latlon = _to_latlon(x, y)
            if loc_mrid and loc_mrid not in self.location_coords:
                self.location_coords[loc_mrid] = latlon
            if eq_mrid not in self.eq_coords:
                self.eq_coords[eq_mrid] = latlon

        logger.info(
            "  Coordinates: %d equipment geocoded from %d position points (geographic=%s)",
            len(self.eq_coords),
            len(raw_points),
            is_geographic,
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

        # We store (class_name, default_type_label)
        type_map_configs = [
            ("ACLineSegment", "ACLineSegment"),
            ("PowerTransformer", "PowerTransformer"),
            ("Breaker", "Breaker"),
            ("LoadBreakSwitch", "LoadBreakSwitch"),
            ("EnergyConsumer", "EnergyConsumer"),
            ("EnergySource", "EnergySource"),
            ("TransformerTank", "PowerTransformer"),
            ("StepVoltageRegulator", "Regulator"),
            ("Regulator", "Regulator"),
            ("Fuse", "Fuse"),
            ("Disconnector", "Disconnector"),
            ("Recloser", "Recloser"),
            ("LinearShuntCompensator", "Capacitor"),
        ]

        for cls_name, default_label in type_map_configs:
            cls = getattr(cim, cls_name, None)
            if not cls:
                continue
            
            for _eid, eq in graph.get(cls, {}).items():
                m = _mrid_str(eq)
                if not m:
                    continue
                
                label = default_label
                # If it's a transformer but has a tap changer, it's functionally a Regulator
                if cls_name in ("PowerTransformer", "TransformerTank"):
                    if m in self.transformer_has_tap_changer:
                        label = "Regulator"
                
                self.equipment_types[m] = label
                
                # Metadata for switches
                if label in ("Breaker", "LoadBreakSwitch", "Fuse",
                             "Disconnector", "Recloser"):
                    is_open = getattr(eq, "normalOpen", None) or getattr(eq, "open", None)
                    self.equipment_open[m] = bool(is_open) if is_open is not None else False

        # Substation handling
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
        # Check both directions: RTC pointing to End, and End having an RTC.
        
        def _register_rtc(rtc_obj, parent_id):
            if not parent_id:
                return
            self.transformer_has_tap_changer[parent_id] = True
            rtc_data = {
                "step": _safe_float(getattr(rtc_obj, "step", None)),
                "neutralStep": _safe_float(getattr(rtc_obj, "neutralStep", None)),
                "lowStep": _safe_float(getattr(rtc_obj, "lowStep", None)),
                "highStep": _safe_float(getattr(rtc_obj, "highStep", None)),
                "neutralU": _safe_float(getattr(rtc_obj, "neutralU", None)),
                "stepVoltageIncrement": _safe_float(getattr(rtc_obj, "stepVoltageIncrement", None)),
            }
            self.transformer_tap_changers[parent_id] = rtc_data

        # Mode A: RatioTapChanger -> TransformerEnd
        rtc_cls = getattr(cim, "RatioTapChanger", None)
        if rtc_cls:
            for _eid, rtc in graph.get(rtc_cls, {}).items():
                pte = getattr(rtc, "TransformerEnd", None) or getattr(rtc, "RatioTapChangerInfo", None)
                if pte:
                    tank = getattr(pte, "TransformerTank", None)
                    tank_id = _mrid_str(tank)
                    if tank_id:
                        _register_rtc(rtc, tank_id)
                        pt = getattr(tank, "PowerTransformer", None)
                        if pt: _register_rtc(rtc, _mrid_str(pt))
                    
                    pt = getattr(pte, "PowerTransformer", None)
                    if pt: _register_rtc(rtc, _mrid_str(pt))

        # Mode B: TransformerEnd -> RatioTapChanger (Often the case in this specific Neo4j ingestion)
        for cls_name in ["PowerTransformerEnd", "TransformerTankEnd"]:
            cls = getattr(cim, cls_name, None)
            if not cls: continue
            for _eid, pte in graph.get(cls, {}).items():
                rtc = getattr(pte, "RatioTapChanger", None)
                if rtc:
                    parent = getattr(pte, "PowerTransformer", None) or getattr(pte, "TransformerTank", None)
                    parent_id = _mrid_str(parent)
                    if parent_id:
                        _register_rtc(rtc, parent_id)
                        if cls_name == "TransformerTankEnd":
                            pt_from_tank = getattr(parent, "PowerTransformer", None)
                            if pt_from_tank: _register_rtc(rtc, _mrid_str(pt_from_tank))
                    
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

        logger.info(
            "  Transformer KVA index: %d transformers rated",
            len(self.transformer_kva),
        )
