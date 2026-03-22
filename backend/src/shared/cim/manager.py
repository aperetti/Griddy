"""CimModelManager — thin orchestrator that loads a CIM model and exposes the public API.

Instances are created by ``CimModelRegistry`` (one per XML file).
A legacy singleton accessor ``get_instance()`` is retained for backward-compatibility
with scripts that load a single model.
"""

import logging
from pathlib import Path
from typing import Any, Optional

from src.shared.cim.helpers import _mrid_str, _get_name, _safe_float, _parse_phase_code
from src.shared.cim.loader import _resolve_xml_path
from src.shared.cim.indexes import IndexBuilder
from src.shared.cim.topology import TopologyBuilder

logger = logging.getLogger(__name__)


class CimModelManager:
    """Holds a single in-memory CIM-Graph FeederModel.

    After ``load()`` is called the manager provides:
    * Pre-computed topology (nodes & edges) for the NetworkX graph.
    * Rich CIM equipment look-ups by mRID or CIM class.
    * Container / voltage-level hierarchy queries.
    """

    _instance: Optional["CimModelManager"] = None

    def __init__(self):
        self.network = None      # FeederModel
        self.cim = None          # cimgraph.data_profile.cimhub_2023
        self._loaded = False
        self.model_id: str = ""  # set by registry or load()

        self._idx: Optional[IndexBuilder] = None

        # Pre-computed topology
        self._topology_nodes: list[dict] = []
        self._topology_edges: list[dict] = []

    # ── Singleton access (legacy — prefer CimModelRegistry) ───────

    @classmethod
    def get_instance(cls) -> "CimModelManager":
        if cls._instance is None:
            cls._instance = CimModelManager()
        return cls._instance

    @classmethod
    def reset(cls):
        """Reset singleton (useful for testing)."""
        cls._instance = None

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    # ══════════════════════════════════════════════════════════════
    # Loading
    # ══════════════════════════════════════════════════════════════

    def load(self, xml_path: str | None = None):
        """Parse the CIM XML with CIM-Graph and build all indexes.

        Safe to call multiple times — subsequent calls are no-ops.
        """
        if self._loaded:
            logger.info("CIM model already loaded – skipping")
            return

        path = _resolve_xml_path(xml_path)
        logger.info("Loading CIM model from: %s", path)

        if not path.is_file():
            raise FileNotFoundError(f"CIM XML not found: {path}")

        self.model_id = path.stem

        # Deferred import so env vars set in loader.py take effect first
        import cimgraph.data_profile.cimhub_2023 as cim
        from cimgraph.databases import XMLFile
        from cimgraph.models import FeederModel

        self.cim = cim

        xml_file = XMLFile(filename=str(path))
        self.network = FeederModel(container=cim.Feeder(), connection=xml_file)

        # Load equipment catalog classes (not in feeder container by default)
        logger.info("Loading transformer and equipment catalog...")
        for cls_type in [
            getattr(cim, "TransformerTankInfo", None),
            getattr(cim, "TransformerEndInfo", None),
            getattr(cim, "PowerTransformerInfo", None),
            getattr(cim, "Asset", None),
            getattr(cim, "AssetInfo", None),
            getattr(cim, "PowerTransformer", None),
            getattr(cim, "PowerTransformerEnd", None),
            getattr(cim, "TransformerTank", None),
            getattr(cim, "TransformerTankEnd", None),
            getattr(cim, "Fuse", None),
            getattr(cim, "Recloser", None),
            getattr(cim, "RatioTapChanger", None),
            getattr(cim, "PhaseTapChanger", None),
            getattr(cim, "TapChanger", None),
            getattr(cim, "RatioTapChangerInfo", None),
            getattr(cim, "TapChangerInfo", None),
            getattr(cim, "OperationalLimitSet", None),
            getattr(cim, "OperationalLimitValue", None),
            getattr(cim, "CurrentLimit", None),
        ]:
            if cls_type:
                logger.info("  Fetching %s...", cls_type.__name__)
                self.network.get_all_attributes(cls_type)
        
        logger.info("CIM classes loaded:")
        for cls, objs in sorted(self.network.graph.items(), key=lambda x: x[0].__name__):
            if objs:
                logger.info("  %-30s %6d", cls.__name__, len(objs))

        # Build indexes (includes manual XML scan for transformer ratings)
        self._idx = IndexBuilder(cim, self.network.graph, xml_path=path)
        self._idx.build()

        # Build topology
        topo = TopologyBuilder(cim, self.network.graph, self._idx)
        topo.build()
        self._topology_nodes = topo.nodes
        self._topology_edges = topo.edges

        self._loaded = True
        logger.info(
            "CIM model ready – %d nodes, %d edges",
            len(self._topology_nodes),
            len(self._topology_edges),
        )

    # ══════════════════════════════════════════════════════════════
    # Public query API
    # ══════════════════════════════════════════════════════════════

    def get_topology_nodes(self) -> list[dict]:
        """All pre-computed topology nodes."""
        return self._topology_nodes

    def get_topology_edges(self) -> list[dict]:
        """All pre-computed topology edges."""
        return self._topology_edges

    def get_cim_schema(self) -> dict:
        """Return a structured schema of common CIM classes and their attributes for the rule builder."""
        schema = {}
        # Core classes we want to highlight in the rule builder
        target_classes = [
            "PowerTransformer", "TransformerTank", "TransformerTankInfo", "TransformerEndInfo",
            "Fuse", "Recloser", "Breaker", "LoadBreakSwitch", "Disconnector",
            "EnergyConsumer", "EnergySource", "LinearShuntCompensator", "ACLineSegment",
            "Asset", "AssetInfo"
        ]
        
        cim = self.cim
        graph = self.network.graph
        
        for class_name in target_classes:
            cls_obj = getattr(cim, class_name, None)
            if not cls_obj or cls_obj not in graph or not graph[cls_obj]:
                continue
                
            # Take one instance to inspect attributes
            sample_id = next(iter(graph[cls_obj]))
            sample = graph[cls_obj][sample_id]
            
            attributes = []
            if hasattr(sample, "__dataclass_fields__"):
                for attr, field in sample.__dataclass_fields__.items():
                    # Simplified attribute metadata
                    # In a real CIM profile we'd check field.type, but for now we look at sample values
                    val = getattr(sample, attr, None)
                    attr_type = "string"
                    if isinstance(val, (int, float)): attr_type = "number"
                    elif isinstance(val, bool): attr_type = "boolean"
                    
                    attributes.append({
                        "name": attr,
                        "type": attr_type,
                        "is_complex": not isinstance(val, (str, int, float, bool, type(None)))
                    })
            
            schema[class_name] = {
                "attributes": attributes,
                "count": len(graph[cls_obj])
            }
            
        return schema

    def get_cim_classes(self) -> dict[str, int]:
        """Summary of every CIM class in the model with object counts."""
        result = {}
        for cls, objs in self.network.graph.items():
            if objs:
                result[cls.__name__] = len(objs)
        return dict(sorted(result.items()))

    def get_all_equipment_by_class(self, class_name: str) -> list[dict]:
        """Return summary dicts for every object of a given CIM class."""
        results = []
        for cim_cls, objs in self.network.graph.items():
            if cim_cls.__name__ == class_name:
                for _eid, obj in objs.items():
                    m = _mrid_str(obj)
                    if m:
                        results.append({
                            "mrid": m,
                            "name": _get_name(obj),
                            "cim_class": class_name,
                        })
        return results

    # ── Equipment detail ──────────────────────────────────────────

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
            "ACLineSegment":          self._enrich_line_segment,
            "PowerTransformer":       self._enrich_transformer,
            "Breaker":                self._enrich_switch,
            "LoadBreakSwitch":        self._enrich_switch,
            "Fuse":                   self._enrich_switch,
            "Disconnector":           self._enrich_switch,
            "Recloser":               self._enrich_switch,
            "EnergyConsumer":         self._enrich_energy_consumer,
            "EnergySource":           self._enrich_energy_source,
            "LinearShuntCompensator": self._enrich_capacitor,
        }
        enricher = enrichers.get(cls_name)
        if enricher:
            enricher(detail, obj)

        # Apply specific identification flags
        if cls_name == "Fuse":
            detail["is_fuse"] = True
        elif cls_name == "Recloser":
            detail["is_recloser"] = True
        elif cls_name == "Disconnector":
            detail["is_disconnector"] = True

        return detail

    def get_node_cim_details(self, node_id: str) -> dict | None:
        """Enriched CIM details for a connectivity-node and its equipment."""
        if self._idx is None:
            return None
        cim = self.cim
        cn_obj = None
        for _cid, cn in self.network.graph.get(getattr(cim, "ConnectivityNode", None), {}).items():
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
                result["base_voltage_kv"] = _safe_float(
                    getattr(bv, "nominalVoltage", None)
                )

        for eq_mrid in self._idx.cn_equipment.get(node_id, []):
            eq_detail = self.get_equipment_detail(eq_mrid)
            if eq_detail:
                result["connected_equipment"].append(eq_detail)

        return result

    def get_neighbors(self, target_id: str) -> dict | None:
        """Returns immediate graph neighbors for a connectivity node or equipment."""
        if self._idx is None:
            return None
        
        # 1. Is it a connectivity node?
        node_detail = self.get_node_cim_details(target_id)
        if node_detail:
            # Neighbors are connected equipment
            neighbors = []
            for eq in node_detail["connected_equipment"]:
                neighbors.append({
                    "id": eq["mrid"],
                    "type": "Equipment",
                    "cim_class": eq["cim_class"],
                    "name": eq["name"]
                })
            return {
                "id": target_id,
                "type": "ConnectivityNode",
                "name": node_detail["name"],
                "neighbors": neighbors
            }
            
        # 2. Is it equipment?
        eq_detail = self.get_equipment_detail(target_id)
        if eq_detail:
            # Neighbors are connectivity nodes via terminals
            neighbors = []
            for t in eq_detail["terminals"]:
                cn_id = t["connectivity_node"]
                # We can't use registry here, so we hope it's in the same manager
                cn_detail = self.get_node_cim_details(cn_id)
                neighbors.append({
                    "id": cn_id,
                    "type": "ConnectivityNode",
                    "name": cn_detail["name"] if cn_detail else cn_id
                })
            return {
                "id": target_id,
                "type": "Equipment",
                "cim_class": eq_detail["cim_class"],
                "name": eq_detail["name"],
                "neighbors": neighbors
            }
            
        return None

    def _extract_primitives(self, obj) -> dict:
        """Helper to extract all primitive properties (strings, floats, ints, bools) from any CIM object."""
        detail: dict[str, Any] = {
            "mrid": _mrid_str(obj),
            "name": _get_name(obj),
        }
        
        # Dynamically extract all primitive fields using their exact CIM names
        if hasattr(obj, "__dataclass_fields__"):
            for attr in obj.__dataclass_fields__.keys():
                # Skip already handled or complex objects
                if attr in ("mRID", "name", "identifier", "aliasName", "description"):
                    continue
                
                val = getattr(obj, attr, None)
                if val is not None:
                    # Rename specific fields for clarity and perform standard unit conversion
                    if attr == "ratedS" and isinstance(val, (int, float)):
                        detail["sapparent_kva"] = float(val) / 1000.0
                        continue
                    if attr == "ratedU" and isinstance(val, (int, float)):
                        detail["rated_u_kv"] = float(val) / 1000.0
                        continue
                        
                    # Only include string, int, float, or bool primitives
                    if isinstance(val, (str, int, float, bool)):
                        detail[attr] = val
                    elif hasattr(val, "value"): # Handle enums like WindingConnection
                        detail[attr] = str(val.value)
        else:
            # Fallback if no __dataclass_fields__ (e.g., custom mock wrapper)
            detail["endNumber"] = getattr(obj, "endNumber", None)
            for attr in ["ratedS", "ratedU", "r", "x", "connectionKind"]:
                val = getattr(obj, attr, None)
                if val is not None:
                    if attr == "ratedS" and isinstance(val, (int, float)):
                        detail["sapparent_kva"] = float(val) / 1000.0
                    elif attr == "ratedU" and isinstance(val, (int, float)):
                        detail["rated_u_kv"] = float(val) / 1000.0
                    else:
                        detail[attr] = str(val.value) if hasattr(val, 'value') else val

        return detail

    # ── Type-specific enrichment helpers ──────────────────────────

    def _enrich_line_segment(self, detail: dict, obj):
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

    def _enrich_transformer(self, detail: dict, obj):
        """PowerTransformer: winding data, tap changer."""
        cim = self.cim
        graph = self.network.graph

        ends: list[dict] = []
        hierarchy = {
            "mrid": detail["mrid"],
            "name": detail.get("name"),
            "class": "PowerTransformer",
            "attributes": detail.copy(),
            "children": []
        }
        
        # 1. Look for PowerTransformerEnd (Transmission/Substation level)
        pte_cls = getattr(cim, "PowerTransformerEnd", None)
        if pte_cls:
            for _eid, pte in graph.get(pte_cls, {}).items():
                pt = getattr(pte, "PowerTransformer", None)
                if pt and _mrid_str(pt) == detail["mrid"]:
                    end_data = self._extract_primitives(pte)
                    ends.append(end_data)
                    hierarchy["children"].append({
                        "mrid": end_data["mrid"],
                        "name": end_data.get("name") or f"End {end_data.get('endNumber', '')}",
                        "class": "PowerTransformerEnd",
                        "attributes": end_data
                    })

        # 2. Look for TransformerTank (Distribution level: PT -> Tank -> TankInfo -> EndInfo)
        tt_cls = getattr(cim, "TransformerTank", None)
        if tt_cls:
            for _eid, tank in graph.get(tt_cls, {}).items():
                pt = getattr(tank, "PowerTransformer", None)
                if pt and _mrid_str(pt) == detail["mrid"]:
                    tank_data = self._extract_primitives(tank)
                    tank_node = {
                        "mrid": tank_data["mrid"],
                        "name": tank_data.get("name") or "TransformerTank",
                        "class": "TransformerTank",
                        "attributes": tank_data,
                        "children": []
                    }
                    
                    # Tank Info (Catalog Data)
                    ti = getattr(tank, "TransformerTankInfo", None)
                    if ti:
                        ti_data = self._extract_primitives(ti)
                        ti_mrid = _mrid_str(ti)
                        tank_node["children"].append({
                            "mrid": ti_mrid,
                            "name": ti_data.get("name") or "TransformerTankInfo",
                            "class": "TransformerTankInfo",
                            "attributes": ti_data
                        })
                        
                        # Match Ends for Catalog
                        ei_cls = getattr(cim, "TransformerEndInfo", None)
                        if ei_cls and ti_mrid:
                            for _ei_id, ei in graph.get(ei_cls, {}).items():
                                ei_ti = getattr(ei, "TransformerTankInfo", None)
                                if ei_ti and _mrid_str(ei_ti) == ti_mrid:
                                    info_data = self._extract_primitives(ei)
                                    if not ends: ends.append(info_data) # Legacy compat
                                    tank_node["children"].append({
                                        "mrid": info_data["mrid"],
                                        "name": info_data.get("name") or f"EndInfo {info_data.get('endNumber', '')}",
                                        "class": "TransformerEndInfo",
                                        "attributes": info_data
                                    })
                                    
                    # Tank Ends (Actual instance connections)
                    tte_cls = getattr(cim, "TransformerTankEnd", None)
                    if tte_cls:
                        for _eeid, tte in graph.get(tte_cls, {}).items():
                            tt_p = getattr(tte, "TransformerTank", None)
                            if tt_p and _mrid_str(tt_p) == tank_node["mrid"]:
                                tte_data = self._extract_primitives(tte)
                                tte_node = {
                                    "mrid": tte_data["mrid"],
                                    "name": tte_data.get("name") or f"TankEnd {tte_data.get('endNumber', '')}",
                                    "class": "TransformerTankEnd",
                                    "attributes": tte_data,
                                    "children": []
                                }
                                
                                # Match with TransformerEndInfo from the catalog if we have TankInfo
                                enum = getattr(tte, "endNumber", None)
                                if ti and enum:
                                    ei_cls = getattr(cim, "TransformerEndInfo", None)
                                    if ei_cls:
                                        for _eiid, tei in graph.get(ei_cls, {}).items():
                                            ti_p = getattr(tei, "TransformerTankInfo", None)
                                            if ti_p and _mrid_str(ti_p) == _mrid_str(ti):
                                                if getattr(tei, "endNumber", None) == enum:
                                                    ei_data = self._extract_primitives(tei)
                                                    tte_node["children"].append({
                                                        "mrid": ei_data["mrid"],
                                                        "name": ei_data.get("name") or f"EndInfo {ei_data.get('endNumber', '')}",
                                                        "class": "TransformerEndInfo",
                                                        "attributes": ei_data
                                                    })
                                
                                tank_node["children"].append(tte_node)

                    hierarchy["children"].append(tank_node)

        detail["hierarchy"] = hierarchy
        detail["transformerends"] = sorted(ends, key=lambda e: e.get("endNumber") or 0)

        # Look for RatioTapChanger

        # Look for RatioTapChanger
        rtc_cls = getattr(cim, "RatioTapChanger", None)
        if rtc_cls:
            winding_mrids = {w["mrid"] for w in ends if w.get("mrid")}
            for _rid, rtc in self.network.graph.get(rtc_cls, {}).items():
                te = getattr(rtc, "TransformerEnd", None)
                if te and _mrid_str(te) in winding_mrids:
                    detail["RatioTapChanger"] = self._extract_primitives(rtc)
                    break

        # Look for PhaseTapChanger (indicates a voltage regulator)
        ptc_cls = getattr(cim, "PhaseTapChanger", None)
        if ptc_cls:
            winding_mrids = {w["mrid"] for w in ends if w.get("mrid")}
            for _rid, ptc in self.network.graph.get(ptc_cls, {}).items():
                te = getattr(ptc, "TransformerEnd", None)
                if te and _mrid_str(te) in winding_mrids:
                    detail["PhaseTapChanger"] = self._extract_primitives(ptc)
                    break

    def _enrich_switch(self, detail: dict, obj):
        """Breaker / LoadBreakSwitch / Fuse / Disconnector / Recloser."""
        detail["normal_open"] = bool(getattr(obj, "normalOpen", False))
        detail["open"] = bool(getattr(obj, "open", False))
        val = _safe_float(getattr(obj, "ratedCurrent", None))
        if val is not None:
            detail["rated_current_a"] = val
            
        # Add CurrentLimit from OperationalLimitSet if it exists
        mrid = _mrid_str(obj)
        limit = self._idx.equipment_current_limits.get(mrid)
        if limit is not None:
            detail["current_limit_a"] = limit
        val = _safe_float(getattr(obj, "breakingCapacity", None))
        if val is not None:
            detail["breaking_capacity"] = val
        
        detail["hierarchy"] = self._build_asset_hierarchy(detail, obj)

    def _enrich_energy_consumer(self, detail: dict, obj):
        """EnergyConsumer (load / meter)."""
        for attr, key in [
            ("p", "active_power_w"),
            ("q", "reactive_power_var"),
        ]:
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
            
        detail["hierarchy"] = self._build_asset_hierarchy(detail, obj)

    def _enrich_energy_source(self, detail: dict, obj):
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
        
        detail["hierarchy"] = self._build_asset_hierarchy(detail, obj)

    def _enrich_capacitor(self, detail: dict, obj):
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
        
        detail["hierarchy"] = self._build_asset_hierarchy(detail, obj)

    def _build_asset_hierarchy(self, detail: dict, obj) -> dict:
        """Generic asset hierarchy builder for equipment."""
        cim = self.cim
        graph = self.network.graph
        
        hierarchy = {
            "mrid": detail["mrid"],
            "name": detail.get("name"),
            "class": detail.get("cim_class", type(obj).__name__),
            "attributes": detail.copy(),
            "children": []
        }
        
        # Look for associated Asset
        asset_cls = getattr(cim, "Asset", None)
        if asset_cls:
            for _eid, asset in graph.get(asset_cls, {}).items():
                # Check for direct link (CIM often uses PowerSystemResource -> Asset)
                psr = getattr(asset, "PowerSystemResource", None)
                if psr and _mrid_str(psr) == detail["mrid"]:
                    asset_data = self._extract_primitives(asset)
                    asset_node = {
                        "mrid": asset_data["mrid"],
                        "name": asset_data.get("name") or "Asset",
                        "class": "Asset",
                        "attributes": asset_data,
                        "children": []
                    }
                    
                    # Asset Info
                    ai = getattr(asset, "AssetInfo", None)
                    if ai:
                        ai_data = self._extract_primitives(ai)
                        asset_node["children"].append({
                            "mrid": ai_data["mrid"],
                            "name": ai_data.get("name") or "AssetInfo",
                            "class": "AssetInfo",
                            "attributes": ai_data
                        })
                    
                    hierarchy["children"].append(asset_node)
                    
        return hierarchy
