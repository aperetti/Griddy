"""CimModelManager — thin orchestrator that loads a CIM model and exposes the public API.

Instances are created by ``CimModelRegistry`` (one per XML file).
A legacy singleton accessor ``get_instance()`` is retained for backward-compatibility
with scripts that load a single model.
"""

import os
import logging
from pathlib import Path
from typing import Any, Optional

from src.shared.cim.helpers import _mrid_str, _get_name, _safe_float, _parse_phase_code
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

        # Lazily populated by classify_field_devices()
        self._field_device_classifications: dict[str, dict] = {}

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

    def load(self, feeder_uri: str | None = None):
        """Load a CIM feeder from Neo4j by its mRID (feeder_uri).

        CIMG_URL must be set. Raises immediately on connection failure or missing data.
        Safe to call multiple times — subsequent calls are no-ops.
        """
        if self._loaded:
            logger.info("Feeder '%s' already loaded – skipping", self.model_id)
            return

        import cimgraph.data_profile.cimhub_2023 as cim
        from cimgraph.databases import Neo4jConnection
        from cimgraph.models import FeederModel

        self.cim = cim
        profile = os.getenv("CIMG_CIM_PROFILE", "cimhub_2023")
        os.environ["CIMG_CIM_PROFILE"] = profile

        if not os.getenv("CIMG_URL"):
            raise EnvironmentError(
                "CIMG_URL is not set. A Neo4j connection is required to load a feeder."
            )
        if not feeder_uri:
            raise ValueError(
                f"feeder_uri is required to load feeder '{self.model_id}' from Neo4j."
            )

        db_name = os.getenv("CIMG_DATABASE", "neo4j")
        logger.info("Loading feeder '%s' (uri=%s, db=%s)...", self.model_id, feeder_uri, db_name)

        # Pass the raw URI string as identifier so cimgraph preserves original casing
        # (Neo4j stores URIs uppercase; FeederModel uses uri() to build the WHERE clause)
        container = cim.Feeder(identifier=feeder_uri)
        connection = Neo4jConnection()
        self.network = FeederModel(container=container, connection=connection)

        if not self.network.graph.get(cim.ConnectivityNode):
            raise ValueError(
                f"Feeder '{self.model_id}' (uri={feeder_uri}) loaded no ConnectivityNodes. "
                f"Check that the feeder URI is correct and data is ingested."
            )

        # Load all classes needed for topology and equipment catalog.
        # With Neo4j, get_all_attributes() is the only way to populate network.graph;
        # XML loading materializes everything automatically so these calls are no-ops there.
        # NOTE: Terminal is intentionally excluded here. create_new_graph() sets
        # Terminal.ConnectivityNode and Terminal.ConductingEquipment as proper objects.
        # Calling get_all_attributes(Terminal) would overwrite those with raw UUID strings
        # (cimgraph uses expand_graph=False), breaking the terminal index.
        #
        # Location MUST come before PositionPoint — equipment get_all_attributes calls
        # add Location objects to the graph; only then can get_all_attributes(PositionPoint)
        # find any UUIDs to fetch coordinates for.
        logger.info("Loading CIM classes (topology + equipment catalog)...")
        for cls_type in [
            # Core topology attributes (not Terminal — see note above)
            getattr(cim, "ConnectivityNode", None),
            getattr(cim, "ACLineSegment", None),
            getattr(cim, "Breaker", None),
            getattr(cim, "LoadBreakSwitch", None),
            getattr(cim, "Disconnector", None),
            getattr(cim, "EnergyConsumer", None),
            getattr(cim, "EnergySource", None),
            getattr(cim, "Substation", None),
            getattr(cim, "VoltageLevel", None),
            # Phase detail
            getattr(cim, "ACLineSegmentPhase", None),
            getattr(cim, "EnergyConsumerPhase", None),
            getattr(cim, "SwitchPhase", None),
            getattr(cim, "ShuntCompensatorPhase", None),
            # Location and PositionPoint are queried directly via Neo4j in IndexBuilder
            # (cimgraph expand_graph=False prevents them from being added to graph here)
            # Equipment catalog
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
            getattr(cim, "LinearShuntCompensator", None),
            getattr(cim, "CurrentLimit", None),
            getattr(cim, "StepVoltageRegulator", None),
            getattr(cim, "Regulator", None),
        ]:
            if cls_type:
                logger.info("  Fetching %s...", cls_type.__name__)
                self.network.get_all_attributes(cls_type)
        
        logger.info("CIM classes loaded:")
        for cls, objs in sorted(self.network.graph.items(), key=lambda x: x[0].__name__):
            if objs:
                logger.info("  %-30s %6d", cls.__name__, len(objs))

        self._idx = IndexBuilder(cim, self.network.graph, feeder_uri=feeder_uri)
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

    def classify_field_devices(self) -> dict[str, dict]:
        """Run all registered FieldDevice classifiers against Neo4j.

        Results are cached on this instance. Subsequent calls return the cache.

        Returns:
            ``{mrid: {"derived_type": str, "child_mrids": list[str], "classifier_name": str}}``
        """
        if self._field_device_classifications:
            return self._field_device_classifications

        from src.shared.cim.field_device_engine import FieldDeviceEngine
        engine = FieldDeviceEngine(self)
        self._field_device_classifications = engine.run()
        return self._field_device_classifications

    def get_field_device_classifications(self) -> dict[str, dict]:
        """Return cached field device classifications (empty dict if not yet run)."""
        return self._field_device_classifications

    def execute_cypher(self, query: str, params: dict = None) -> list[dict]:
        """Execute a raw Cypher query against the Neo4j database.

        Uses the standard neo4j Python driver directly with env var credentials,
        independent of cimgraph's internal connection management.

        Returns:
            List of result records (dicts), or [] if Neo4j is not configured.
        """
        neo4j_url = os.getenv("CIMG_URL")
        if not neo4j_url:
            logger.warning("execute_cypher: CIMG_URL not set, skipping.")
            return []

        username = os.getenv("CIMG_USERNAME", "neo4j")
        password = os.getenv("CIMG_PASSWORD", "")
        database = os.getenv("CIMG_DATABASE", "neo4j")

        from neo4j import GraphDatabase
        try:
            driver = GraphDatabase.driver(neo4j_url, auth=(username, password))
            with driver.session(database=database) as session:
                # 15-second wall-clock timeout — prevents slow classification queries
                # from hanging the topology endpoint indefinitely.
                result = session.run(query, **(params or {}),
                                     timeout=15)
                records = [dict(r) for r in result]
            driver.close()
            return records
        except Exception as e:
            logger.error("execute_cypher failed: %s", e)
            return []

    def get_cim_schema(self) -> dict:
        """Return a structured schema of common CIM classes and their attributes for the rule builder."""
        schema = {}
        # Core classes we want to highlight in the rule builder
        from src.shared.cim.mapping import CIM_PROPERTY_MAP
        target_classes = list(set([
            "PowerTransformer", "TransformerTank", "TransformerTankInfo", "TransformerEndInfo",
            "Fuse", "Recloser", "Breaker", "LoadBreakSwitch", "Disconnector",
            "EnergyConsumer", "EnergySource", "LinearShuntCompensator", "ACLineSegment",
            "Asset", "AssetInfo"
        ] + list(CIM_PROPERTY_MAP.keys())))
        
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
            
        # Add mapped properties that might not be direct attributes
        from src.shared.cim.mapping import CIM_PROPERTY_MAP
        for class_name, mapped_props in CIM_PROPERTY_MAP.items():
            if class_name in schema:
                existing_names = {a["name"] for a in schema[class_name]["attributes"]}
                for prop_name in mapped_props:
                    if prop_name not in existing_names:
                        schema[class_name]["attributes"].append({
                            "name": prop_name,
                            "type": "number", 
                            "is_complex": False
                        })
            
        return schema

    def get_class_connections(self, class_name: str) -> list[str]:
        """Discovery of classes attached to a given class in this specific model.
        
        Logic:
        1. Find all instances of class_name.
        2. Find all ConnectivityNodes sharing a Terminal with those instances.
        3. Find all other equipment sharing those ConnectivityNodes.
        """
        if not self._loaded or not self._idx:
            return []
            
        cim = self.cim
        graph = self.network.graph
        
        cls_obj = getattr(cim, class_name, None)
        if not cls_obj or cls_obj not in graph:
            return []
            
        connected_classes = set()
        
        # We use the indexes for speed
        for mrid in graph[cls_obj].keys():
            # Get terminals for this equipment
            terminals = self._idx.eq_terminals.get(mrid, [])
            for _term, cn_mrid in terminals:
                # Add the ConnectivityNode itself
                connected_classes.add("ConnectivityNode")
                
                # Find all equipment attached to this node
                peer_mrids = self._idx.cn_equipment.get(cn_mrid, [])
                for peer_mrid in peer_mrids:
                    if peer_mrid == mrid:
                        continue
                        
                    # Lookup peer class
                    peer_entry = self._idx.equipment_index.get(peer_mrid)
                    if peer_entry:
                        connected_classes.add(peer_entry[0])
                        
        return sorted(list(connected_classes))

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

        # Apply virtual property mappings (high-value properties like ratedS, r, x)
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

    def get_equipment_detail_expanded(self, mrid: str) -> dict | None:
        """Equipment detail with terminal connectivity nodes expanded to full objects."""
        detail = self.get_equipment_detail(mrid)
        if not detail:
            return None
        expanded_terminals = []
        for terminal in detail.get('terminals', []):
            cn_mrid = terminal.get('connectivity_node')
            if cn_mrid and isinstance(cn_mrid, str):
                cn_detail = self.get_node_cim_details(cn_mrid)
                expanded_terminals.append({
                    **terminal,
                    'connectivity_node': cn_detail if cn_detail else cn_mrid,
                })
            else:
                expanded_terminals.append(terminal)
        detail['terminals'] = expanded_terminals
        return detail

    def get_node_properties(self, target_id: str) -> dict | None:
        """Return all properties of any CIM node by querying Neo4j directly.

        Works for any node type regardless of equipment_index coverage.
        """
        import os
        from neo4j import GraphDatabase

        neo4j_url = os.getenv("CIMG_URL")
        if not neo4j_url:
            return None

        username = os.getenv("CIMG_USERNAME", "neo4j")
        password = os.getenv("CIMG_PASSWORD", "")
        database = os.getenv("CIMG_DATABASE", "neo4j")

        uuid_lower = target_id.lower()
        uuid_upper = target_id.upper()
        uri_variants = [f"urn:uuid:{uuid_lower}", f"urn:uuid:{uuid_upper}"]

        query = """
MATCH (n) WHERE n.uri IN $uris
RETURN properties(n) AS props, labels(n) AS lbls
LIMIT 1
"""
        try:
            driver = GraphDatabase.driver(neo4j_url, auth=(username, password))
            with driver.session(database=database) as session:
                rows = list(session.run(query, uris=uri_variants))
            driver.close()
        except Exception as e:
            logger.error("get_node_properties Neo4j query failed: %s", e)
            return None

        if not rows:
            return None

        raw: dict = dict(rows[0]["props"])
        lbls: list[str] = rows[0]["lbls"] or []

        # Determine best CIM class from labels
        skip = {"Resource", "IdentifiedObject", "PowerSystemResource", "Equipment",
                "ConductingEquipment", "Connector", "EnergyConnection"}
        specific = [l for l in lbls if l not in skip]
        cim_class = specific[0] if specific else (lbls[0] if lbls else "Object")

        # Strip urn:uuid: prefix from uri and normalise mRID
        raw_uri = raw.pop("uri", None) or ""
        mrid = raw_uri.replace("urn:uuid:", "").upper() or target_id

        # Return full namespaced keys as-is so the frontend condition path is self-describing.
        # e.g. "TransformerEndInfo.ratedS" stays as "TransformerEndInfo.ratedS" — the
        # frontend strips the class prefix for display but keeps the full key in the condition.
        props: dict = {"mrid": mrid, "cim_type": cim_class}
        for k, v in raw.items():
            props[k] = v

        return props

    def get_neighbors(self, target_id: str) -> dict | None:
        """Returns all immediate CIM graph neighbors for any node by querying Neo4j directly.

        Traverses both outgoing and incoming relationships so nothing is missed
        regardless of which direction CIM stores the reference.
        """
        import os
        from neo4j import GraphDatabase

        neo4j_url = os.getenv("CIMG_URL")
        if not neo4j_url:
            return None

        username = os.getenv("CIMG_USERNAME", "neo4j")
        password = os.getenv("CIMG_PASSWORD", "")
        database = os.getenv("CIMG_DATABASE", "neo4j")

        # Try both lowercase and uppercase URI formats — n10s may store either.
        uuid_lower = target_id.lower()
        uuid_upper = target_id.upper()
        uri_variants = [
            f"urn:uuid:{uuid_lower}",
            f"urn:uuid:{uuid_upper}",
        ]

        # Two simple queries: outgoing then incoming edges.
        # Avoids CALL subquery which requires Neo4j 4.1+.
        q_outgoing = """
MATCH (n)-[r]->(nb)
WHERE n.uri IN $uris AND nb.uri IS NOT NULL
RETURN
    n.uri AS root_uri,
    coalesce(n.`IdentifiedObject.name`, '') AS root_name,
    labels(n)  AS root_labels,
    type(r)    AS relation,
    nb.uri     AS nb_uri,
    coalesce(nb.`IdentifiedObject.name`, '') AS nb_name,
    labels(nb) AS nb_labels
"""
        q_incoming = """
MATCH (nb)-[r]->(n)
WHERE n.uri IN $uris AND nb.uri IS NOT NULL
RETURN
    n.uri AS root_uri,
    coalesce(n.`IdentifiedObject.name`, '') AS root_name,
    labels(n)  AS root_labels,
    type(r)    AS relation,
    nb.uri     AS nb_uri,
    coalesce(nb.`IdentifiedObject.name`, '') AS nb_name,
    labels(nb) AS nb_labels
"""

        try:
            driver = GraphDatabase.driver(neo4j_url, auth=(username, password))
            with driver.session(database=database) as session:
                rows = list(session.run(q_outgoing, uris=uri_variants)) + \
                       list(session.run(q_incoming, uris=uri_variants))
            driver.close()
        except Exception as e:
            logger.error("get_neighbors Neo4j query failed: %s", e)
            return None

        if not rows:
            return None

        def _strip_uri(uri: str) -> str:
            for pfx in ("urn:uuid:", "_"):
                if uri.startswith(pfx):
                    uri = uri[len(pfx):]
            return uri.upper()

        def _cim_class(labels: list[str]) -> str:
            skip = {"Resource", "IdentifiedObject", "PowerSystemResource", "Equipment",
                    "ConductingEquipment", "Connector", "EnergyConnection"}
            specific = [l for l in (labels or []) if l not in skip]
            return specific[0] if specific else (labels[0] if labels else "Object")

        first = rows[0]
        root_mrid = _strip_uri(first["root_uri"])
        root_name = first["root_name"] or root_mrid[:12]
        root_cim_class = _cim_class(first["root_labels"])

        seen: set[str] = {root_mrid}
        neighbors = []
        for row in rows:
            nb_uri = row["nb_uri"]
            if not nb_uri:
                continue
            nb_mrid = _strip_uri(nb_uri)
            if nb_mrid in seen:
                continue
            seen.add(nb_mrid)
            nb_class = _cim_class(row["nb_labels"])
            nb_name = row["nb_name"] or nb_mrid[:12]
            neighbors.append({
                "id": nb_mrid,
                "cim_class": nb_class,
                "type": nb_class,
                "name": nb_name,
                "relation": row["relation"],
            })

        return {
            "id": root_mrid,
            "cim_class": root_cim_class,
            "type": root_cim_class,
            "name": root_name,
            "neighbors": neighbors,
        }

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
        hierarchy: dict[str, Any] = {
            "mrid": detail["mrid"],
            "name": detail.get("name"),
            "class": "PowerTransformer",
        }
        
        def _add_to_node(node: dict, child: dict):
            cls = child.get("class", "Unknown").lower()
            if cls not in node:
                node[cls] = []
            node[cls].append(child)
        
        # 1. Look for PowerTransformerEnd (Transmission/Substation level)
        pte_cls = getattr(cim, "PowerTransformerEnd", None)
        if pte_cls:
            for _eid, pte in graph.get(pte_cls, {}).items():
                pt = getattr(pte, "PowerTransformer", None)
                if pt and _mrid_str(pt) == detail["mrid"]:
                    end_data = self._extract_primitives(pte)
                    ends.append(end_data)
                    _add_to_node(hierarchy, {
                        "class": "PowerTransformerEnd",
                        **end_data
                    })

        # 2. Look for TransformerTank (Distribution level: PT -> Tank -> TankInfo -> EndInfo)
        tt_cls = getattr(cim, "TransformerTank", None)
        if tt_cls:
            for _eid, tank in graph.get(tt_cls, {}).items():
                pt = getattr(tank, "PowerTransformer", None)
                if pt and _mrid_str(pt) == detail["mrid"]:
                    tank_data = self._extract_primitives(tank)
                    tank_node = {
                        "class": "TransformerTank",
                        **tank_data,
                    }
                    
                    # Tank Info (Catalog Data)
                    ti = getattr(tank, "TransformerTankInfo", None)
                    if ti:
                        ti_data = self._extract_primitives(ti)
                        ti_mrid = _mrid_str(ti)
                        _add_to_node(tank_node, {
                            "class": "TransformerTankInfo",
                            **ti_data
                        })
                        
                        # Match Ends for Catalog
                        ei_cls = getattr(cim, "TransformerEndInfo", None)
                        if ei_cls and ti_mrid:
                            for _ei_id, ei in graph.get(ei_cls, {}).items():
                                ei_ti = getattr(ei, "TransformerTankInfo", None)
                                if ei_ti and _mrid_str(ei_ti) == ti_mrid:
                                    info_data = self._extract_primitives(ei)
                                    if not ends: ends.append(info_data) # Legacy compat
                                    _add_to_node(tank_node, {
                                        "class": "TransformerEndInfo",
                                        **info_data
                                    })
                                    
                    # Tank Ends (Actual instance connections)
                    tte_cls = getattr(cim, "TransformerTankEnd", None)
                    if tte_cls:
                        for _eeid, tte in graph.get(tte_cls, {}).items():
                            tt_p = getattr(tte, "TransformerTank", None)
                            if tt_p and _mrid_str(tt_p) == tank_node["mrid"]:
                                tte_data = self._extract_primitives(tte)
                                tte_node = {
                                    "class": "TransformerTankEnd",
                                    **tte_data,
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
                                                    _add_to_node(tte_node, {
                                                        "class": "TransformerEndInfo",
                                                        **ei_data
                                                    })
                                
                                _add_to_node(tank_node, tte_node)

                    _add_to_node(hierarchy, tank_node)

        detail["hierarchy"] = hierarchy
        detail["transformerends"] = sorted(ends, key=lambda e: e.get("endNumber") or 0)

        # Identify if this PowerTransformer is actually a Regulator
        is_regulator = False
        
        # Check 1:1 voltage ratio (Strong signal for Regulator)
        all_rated_u = []
        for end in ends:
            v = _safe_float(end.get("ratedU"))
            if v: all_rated_u.append(v)
            
        def collect_u(node):
            if node.get("class") == "TransformerEndInfo":
                v = _safe_float(node.get("ratedU"))
                if v: all_rated_u.append(v)
            for child in node.get("children", []):
                collect_u(child)
        
        collect_u(hierarchy)
                    
        has_1to1 = (len(all_rated_u) >= 2 and len(set(all_rated_u)) == 1)
        name_lower = (detail.get("name") or "").lower()
        is_named_reg = any(x in name_lower for x in ["reg", "regulator", "vreg"])

        # Look for RatioTapChanger and associated Controls
        rtc_cls = getattr(cim, "RatioTapChanger", None)
        tcc_cls = getattr(cim, "TapChangerControl", None)
        
        if rtc_cls:
            # First find ALL ends belonging to this transformer to match RTCs
            parent_transformer_ends = []
            tank_mrids = []
            
            # Extract Tank MRIDs from hierarchy
            def collect_tanks(node):
                if node.get("class") == "TransformerTank":
                    tank_mrids.append(node["mrid"])
                for child in node.get("children", []):
                    collect_tanks(child)
            collect_tanks(hierarchy)

            pte_cls = getattr(cim, "PowerTransformerEnd", None)
            if pte_cls:
                for _peid, pte in self.network.graph.get(pte_cls, {}).items():
                    pt_p = getattr(pte, "PowerTransformer", None)
                    if pt_p and _mrid_str(pt_p) == detail["mrid"]:
                        parent_transformer_ends.append(_mrid_str(pte))

            # Find RTC through Ends OR Tanks
            for _rid, rtc in self.network.graph.get(rtc_cls, {}).items():
                te = getattr(rtc, "TransformerEnd", None)
                found = False
                if te:
                    te_mrid = _mrid_str(te)
                    if te_mrid in parent_transformer_ends:
                        found = True
                    else:
                        # Fallback: Is this end linked to one of our tanks?
                        tte_cls = getattr(cim, "TransformerTankEnd", None)
                        if tte_cls:
                            for _tteid, tte in self.network.graph.get(tte_cls, {}).items():
                                if _mrid_str(tte) == te_mrid:
                                    tt_p = getattr(tte, "TransformerTank", None)
                                    if tt_p and _mrid_str(tt_p) in tank_mrids:
                                        found = True
                                        break
                
                if found:
                    detail["RatioTapChanger"] = self._extract_primitives(rtc)
                    
                    # Look for TapChangerControl linked to this RTC
                    if tcc_cls:
                        for _tcid, tcc in self.network.graph.get(tcc_cls, {}).items():
                            tc_ref = getattr(tcc, "TapChanger", None)
                            if tc_ref and _mrid_str(tc_ref) == _rid:
                                detail["TapChangerControl"] = self._extract_primitives(tcc)
                                is_regulator = True
                                # Parental link to RegulatingControl
                                rc_ref = getattr(tcc, "RegulatingControl", None)
                                if rc_ref:
                                    detail["RegulatingControl"] = self._extract_primitives(rc_ref)
                                break
                    break

        if is_regulator or (has_1to1 and detail.get("RatioTapChanger")) or is_named_reg:
            detail["display_class"] = "Regulator"

        # Look for PhaseTapChanger
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
        
        hierarchy: dict[str, Any] = {
            "mrid": detail["mrid"],
            "name": detail.get("name"),
            "class": detail.get("cim_class", type(obj).__name__),
            **detail
        }
        
        def _add_to_node(node: dict, child: dict):
            cls = child.get("class", "Unknown").lower()
            if cls not in node:
                node[cls] = []
            node[cls].append(child)
        
        # Look for associated Asset
        asset_cls = getattr(cim, "Asset", None)
        if asset_cls:
            for _eid, asset in graph.get(asset_cls, {}).items():
                # Check for direct link (CIM often uses PowerSystemResource -> Asset)
                psr = getattr(asset, "PowerSystemResource", None)
                if psr and _mrid_str(psr) == detail["mrid"]:
                    asset_data = self._extract_primitives(asset)
                    asset_node = {
                        "class": "Asset",
                        **asset_data,
                    }
                    
                    # Asset Info
                    ai = getattr(asset, "AssetInfo", None)
                    if ai:
                        ai_data = self._extract_primitives(ai)
                        _add_to_node(asset_node, {
                            "class": "AssetInfo",
                            **ai_data
                        })
                    
                    _add_to_node(hierarchy, asset_node)
                    
        return hierarchy
