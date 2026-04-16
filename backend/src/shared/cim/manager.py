"""CimModelManager — thin orchestrator that loads a CIM model and exposes the public API.

Instances are created by ``CimModelRegistry`` (one per XML file).
A legacy singleton accessor ``get_instance()`` is retained for backward-compatibility
with scripts that load a single model.

Internal responsibilities are delegated to:
* ``Neo4jClient``          — raw Cypher execution and node/neighbor lookups
* ``EquipmentEnricher``    — type-specific property enrichment
* ``EquipmentDetailService`` — equipment and node detail assembly
* ``IndexBuilder``         — mRID/terminal/coordinate indexes
* ``TopologyBuilder``      — nodes and edges
* ``FieldDeviceEngine``    — CIM graph-pattern classification (lazy, via classify_field_devices)
"""

import os
import logging
import json
from typing import Any, Optional

from src.shared.cim.helpers import _mrid_str, _get_name, _safe_float
from src.shared.cim.indexes import IndexBuilder
from src.shared.cim.topology import TopologyBuilder
from src.shared.cim.neo4j_client import Neo4jClient

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

        # Services — created after load()
        self._neo4j = Neo4jClient()
        self._detail_svc = None  # EquipmentDetailService

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

        # Load all classes discovered in the database to ensure completeness
        discovered_labels = self._discover_labels(feeder_uri)
        logger.info(
            "Feeder '%s' introspected: %d CIM classes found in database",
            self.model_id,
            len(discovered_labels),
        )

        # Priority and mandatory classes (Location must come before PositionPoint)
        # Terminal is excluded because it is handled via self.network.create_new_graph()
        # which preserves connectivity node objects.
        load_sequence = []
        
        # Ensure core dependencies are loaded early
        for pref in ["BaseVoltage", "Location", "PositionPoint", "ConnectivityNode"]:
            if pref in discovered_labels:
                load_sequence.append(pref)
        
        # Add the rest of the discovered labels
        for label in sorted(discovered_labels):
            if label not in load_sequence:
                load_sequence.append(label)

        logger.info("Loading discovered CIM classes into memory...")
        for label in load_sequence:
            cls_type = getattr(cim, label, None)
            if cls_type:
                try:
                    self.network.get_all_attributes(cls_type)
                except Exception as e:
                    # Some labels might not map to classes in the current profile or might fail loading
                    logger.debug("Could not load attributes for %s: %s", label, e)

        # Map to instance graph for easier consumption
        self.graph = self.network.graph
        self._loaded = True

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

        # Wire up equipment detail services now that graph/idx are ready
        from src.shared.cim.equipment_enricher import EquipmentEnricher
        from src.shared.cim.equipment_detail import EquipmentDetailService
        enricher = EquipmentEnricher(self.cim, self.network.graph, self._idx)
        self._detail_svc = EquipmentDetailService(self._idx, self.network.graph, self.cim, enricher)

        self._loaded = True
        logger.info(
            "CIM model ready – %d nodes, %d edges",
            len(self._topology_nodes),
            len(self._topology_edges),
        )

    # ══════════════════════════════════════════════════════════════
    # Topology
    # ══════════════════════════════════════════════════════════════

    def get_topology_nodes(self) -> list[dict]:
        """All pre-computed topology nodes."""
        return self._topology_nodes

    def get_topology_edges(self) -> list[dict]:
        """All pre-computed topology edges."""
        return self._topology_edges

    # ══════════════════════════════════════════════════════════════
    # Field device classification
    # ══════════════════════════════════════════════════════════════

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

    # ══════════════════════════════════════════════════════════════
    # Neo4j delegation
    # ══════════════════════════════════════════════════════════════

    def execute_cypher(self, query: str, params: dict = None) -> list[dict]:
        """Execute a raw Cypher query against the Neo4j database."""
        return self._neo4j.execute_cypher(query, params)

    def get_node_properties(self, target_id: str) -> dict | None:
        """Return all Neo4j properties for any node by mRID."""
        return self._neo4j.get_node_properties(target_id)

    def get_neighbors(self, target_id: str) -> dict | None:
        """Return all immediate CIM graph neighbors for any node."""
        return self._neo4j.get_neighbors(target_id)

    # ══════════════════════════════════════════════════════════════
    # Equipment detail delegation
    # ══════════════════════════════════════════════════════════════

    def get_equipment_detail(self, mrid: str) -> dict | None:
        """Full CIM detail for any equipment by mRID."""
        return self._detail_svc.get_equipment_detail(mrid) if self._detail_svc else None

    def get_node_cim_details(self, node_id: str) -> dict | None:
        """Enriched CIM details for a connectivity node and its attached equipment."""
        return self._detail_svc.get_node_cim_details(node_id) if self._detail_svc else None

    def get_equipment_detail_expanded(self, mrid: str) -> dict | None:
        """Equipment detail with terminal connectivity nodes expanded to full objects."""
        return self._detail_svc.get_equipment_detail_expanded(mrid) if self._detail_svc else None

    # ══════════════════════════════════════════════════════════════
    # CIM model queries
    # ══════════════════════════════════════════════════════════════

    def get_cim_schema(self) -> dict:
        """Return a structured schema of common CIM classes and their attributes for the rule builder."""
        schema = {}
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

            sample_id = next(iter(graph[cls_obj]))
            sample = graph[cls_obj][sample_id]

            attributes = []
            if hasattr(sample, "__dataclass_fields__"):
                for attr, field in sample.__dataclass_fields__.items():
                    val = getattr(sample, attr, None)
                    attr_type = "string"
                    if isinstance(val, (int, float)):
                        attr_type = "number"
                    elif isinstance(val, bool):
                        attr_type = "boolean"
                    attributes.append({
                        "name": attr,
                        "type": attr_type,
                        "is_complex": not isinstance(val, (str, int, float, bool, type(None)))
                    })

            schema[class_name] = {
                "attributes": attributes,
                "count": len(graph[cls_obj])
            }

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
        """Discovery of classes connected to a given class via shared ConnectivityNodes."""
        if not self._loaded or not self._idx:
            return []

        cim = self.cim
        graph = self.network.graph

        cls_obj = getattr(cim, class_name, None)
        if not cls_obj or cls_obj not in graph:
            return []

        connected_classes: set[str] = set()

        for mrid in graph[cls_obj].keys():
            terminals = self._idx.eq_terminals.get(mrid, [])
            for _term, cn_mrid in terminals:
                connected_classes.add("ConnectivityNode")
                peer_mrids = self._idx.cn_equipment.get(cn_mrid, [])
                for peer_mrid in peer_mrids:
                    if peer_mrid == mrid:
                        continue
                    peer_entry = self._idx.equipment_index.get(peer_mrid)
                    if peer_entry:
                        connected_classes.add(peer_entry[0])

        return sorted(connected_classes)

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

    # ── Private Implementation ────────────────────────────────────────────────

    def _discover_labels(self, feeder_uri: str) -> list[str]:
        """Query Neo4j for all unique labels (classes) present in this feeder."""
        from neo4j import GraphDatabase

        url = os.getenv("CIMG_URL")
        username = os.getenv("CIMG_USERNAME", "neo4j")
        password = os.getenv("CIMG_PASSWORD", "")
        database = os.getenv("CIMG_DATABASE", "neo4j")

        # Normalize URI
        if not feeder_uri.startswith("urn:uuid:"):
            feeder_uri = f"urn:uuid:{feeder_uri}"

        # Labels found on equipment belonging to this feeder or its container
        query = """
        MATCH (f:Feeder {uri: $uri})
        MATCH (n)-[:`Equipment.EquipmentContainer`|MemberOf*0..10]-(f)
        UNWIND labels(n) as label
        RETURN DISTINCT label
        """
        
        labels = []
        try:
            driver = GraphDatabase.driver(url, auth=(username, password))
            with driver.session(database=database) as session:
                result = session.run(query, uri=feeder_uri)
                labels = [row["label"] for row in result]
            driver.close()
        except Exception as e:
            logger.error("Failed to discover labels in Neo4j for feeder %s: %s", feeder_uri, e)
            # Fallback to a bare-minimum set to prevent total failure
            return [
                "ConnectivityNode", "ACLineSegment", "EnergyConsumer", 
                "PowerTransformer", "Location", "PositionPoint", "BaseVoltage"
            ]

        return labels
