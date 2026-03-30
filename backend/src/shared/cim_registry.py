"""CIM Model Registry — manages multiple CIM models loaded in memory.

Discovers XML files in sample_data/ and provides a unified API to:
* List available / loaded models
* Load / unload individual models
* Query topology from one, many, or all models (with combined view)

Each model gets its own CimModelManager instance so phase indexes,
equipment lookups, and topology are fully independent.
"""

import logging
import os
from typing import Optional

from src.shared.cim_model import CimModelManager
from src.shared.cim.profile import CimProfileService


logger = logging.getLogger(__name__)


def _discover_feeders_from_neo4j() -> list[dict]:
    """Query Neo4j for all Feeder nodes and return them as loadable layers."""
    from neo4j import GraphDatabase

    url = os.getenv("CIMG_URL")
    username = os.getenv("CIMG_USERNAME", "neo4j")
    password = os.getenv("CIMG_PASSWORD", "")
    database = os.getenv("CIMG_DATABASE", "neo4j")

    driver = GraphDatabase.driver(url, auth=(username, password))
    try:
        with driver.session(database=database) as session:
            rows = list(session.run(
                "MATCH (f:Feeder) RETURN f.uri AS uri, f.`IdentifiedObject.name` AS name ORDER BY name"
            ))
    finally:
        driver.close()

    results = []
    for row in rows:
        uri: str = row["uri"] or ""
        feeder_mrid = uri.replace("urn:uuid:", "")
        name = row["name"] or feeder_mrid
        results.append({
            "feeder_id": name,
            "feeder_uri": feeder_mrid,
        })

    if not results:
        raise ValueError("No Feeder nodes found in Neo4j. Ensure the CIM model has been ingested.")

    return results


# ═══════════════════════════════════════════════════════════════════════════
# CimModelRegistry
# ═══════════════════════════════════════════════════════════════════════════


class CimModelRegistry:
    """Singleton registry that holds multiple named CimModelManager instances."""

    _instance: Optional["CimModelRegistry"] = None

    def __init__(self):
        self._managers: dict[str, CimModelManager] = {}  # feeder_id → manager
        self._available: list[dict] = []  # discovered feeder metadata from Neo4j
        self._active_models: set[str] = set()  # currently loaded feeder_ids
        self._coordinate_offsets: dict[
            str, tuple[float, float]
        ] = {}  # model_id → (lat_offset, lon_offset)
        self._mrid_to_model: dict[str, str] = {}  # mrid → model_id
        self._node_to_model: dict[str, str] = {}  # node_id → model_id
        self._profile = CimProfileService.get_instance()
        self._profile.initialize()


    @classmethod
    def get_instance(cls) -> "CimModelRegistry":
        if cls._instance is None:
            cls._instance = CimModelRegistry()
        return cls._instance

    @classmethod
    def reset(cls):
        cls._instance = None

    # ── Discovery ─────────────────────────────────────────────────

    def discover(self):
        """Discover available feeders from Neo4j (CIMG_URL required)."""
        if not os.getenv("CIMG_URL"):
            raise EnvironmentError(
                "CIMG_URL is not set. A Neo4j connection is required to discover feeders."
            )

        self._available = _discover_feeders_from_neo4j()
        logger.info(
            "Discovered %d feeder(s) in Neo4j: %s",
            len(self._available),
            [f["feeder_id"] for f in self._available],
        )

    # ── Load / Unload ─────────────────────────────────────────────

    def load_model(self, feeder_id: str) -> CimModelManager:
        """Load a specific feeder by ID. No-op if already loaded."""
        if feeder_id in self._managers and self._managers[feeder_id].is_loaded:
            logger.info("Feeder '%s' already loaded", feeder_id)
            return self._managers[feeder_id]

        meta = self._get_meta(feeder_id)
        if meta is None:
            raise ValueError(f"No discovered feeder with id '{feeder_id}'")

        manager = CimModelManager()
        manager.model_id = feeder_id
        manager.load(feeder_uri=meta["feeder_uri"])
        self._managers[feeder_id] = manager
        self._active_models.add(feeder_id)

        # Assign coordinate offsets so combined models don't overlap
        self._recalculate_offsets()

        # Populate fast-lookup indexes
        if manager._idx is not None:
            for mrid in manager._idx.equipment_index.keys():
                self._mrid_to_model[mrid] = model_id
            
            # Index EVERY node in the topology, even those without equipment
            for node in manager.get_topology_nodes():
                node_id = node.get("node_id")
                if node_id:
                    self._node_to_model[node_id] = model_id

        logger.info(
            "Model '%s' loaded (%d nodes, %d edges)",
            model_id,
            len(manager.get_topology_nodes()),
            len(manager.get_topology_edges()),
        )
        return manager

    def unload_model(self, model_id: str):
        """Unload a model, freeing memory."""
        if model_id in self._managers:
            del self._managers[model_id]
            self._active_models.discard(model_id)
            self._recalculate_offsets()

            # Remove from fast-lookup indexes
            self._mrid_to_model = {
                k: v for k, v in self._mrid_to_model.items() if v != model_id
            }
            self._node_to_model = {
                k: v for k, v in self._node_to_model.items() if v != model_id
            }

            logger.info("Model '%s' unloaded", model_id)

    def load_all(self):
        """Discover all feeders from Neo4j and load them into memory."""
        self.discover()
        for meta in self._available:
            try:
                self.load_model(meta["feeder_id"])
            except Exception as e:
                logger.error("Failed to load feeder '%s': %s", meta["feeder_id"], e)

    # ── Query ─────────────────────────────────────────────────────

    def list_models(self) -> list[dict]:
        """Return metadata for all discovered feeders with loaded status."""
        result = []
        for meta in self._available:
            fid = meta["feeder_id"]
            mgr = self._managers.get(fid)
            result.append(
                {
                    "feeder_id": fid,
                    "feeder_uri": meta["feeder_uri"],
                    "loaded": fid in self._active_models,
                    "node_count": len(mgr.get_topology_nodes()) if mgr and mgr.is_loaded else 0,
                    "edge_count": len(mgr.get_topology_edges()) if mgr and mgr.is_loaded else 0,
                }
            )
        return result

    def get_active_model_ids(self) -> list[str]:
        """IDs of all currently loaded feeders."""
        return sorted(self._active_models)

    def get_manager(self, model_id: str) -> Optional[CimModelManager]:
        """Get a specific loaded manager, or None."""
        return self._managers.get(model_id)

    def get_managers(
        self, model_ids: list[str] | None = None
    ) -> list[tuple[str, CimModelManager]]:
        """Get (model_id, manager) pairs for requested models.

        If model_ids is None or empty, returns all active managers.
        """
        if not model_ids:
            return [
                (mid, mgr)
                for mid, mgr in self._managers.items()
                if mid in self._active_models
            ]
        return [
            (mid, self._managers[mid]) for mid in model_ids if mid in self._managers
        ]

    # ── Combined topology ─────────────────────────────────────────

    def search_all_models(self, query: str, class_name: str | None = None) -> list[dict]:
        """Search across all loaded models for nodes or equipment matching the query."""
        results = []
        lower_query = query.lower()
        lower_class = class_name.lower() if class_name else None
        # Strip common suffixes used in UI display (e.g. " (node)", " (edge)")
        clean_query = lower_query
        for suffix in [" (node)", " (edge)", " (equipment)", " (bus)", " (line)"]:
            clean_query = clean_query.replace(suffix, "")
        clean_query = clean_query.strip()

        for mid, mgr in self.get_managers():
            # Search nodes
            for node in mgr.get_topology_nodes():
                name = (node.get("name") or "").lower()
                node_id = node.get("node_id", "").lower()
                node_type = (node.get("node_type") or "").lower()

                if (
                    clean_query in name
                    or clean_query in node_id
                    or clean_query in node_type
                ):
                    cim_type = node.get("node_type", "ConnectivityNode")
                    if not lower_class or lower_class in cim_type.lower():
                        results.append(
                            {
                                "id": node["node_id"],
                                "name": node.get("name") or node["node_id"],
                                "type": "node",
                                "model_id": mid,
                                "cim_type": cim_type,
                            }
                        )

                # Search attached equipment within nodes
                for eq in node.get("attached_equipment", []):
                    eq_name = (eq.get("name") or "").lower()
                    eq_id = eq.get("mrid", "").lower()
                    eq_type = (eq.get("type") or "").lower()
                    eq_class = (eq.get("cim_class") or "").lower()

                    if (
                        clean_query in eq_name
                        or clean_query in eq_id
                        or clean_query in eq_type
                        or clean_query in eq_class
                    ):
                        cim_type = eq.get("cim_class") or eq.get("type", "Equipment")
                        if not lower_class or lower_class in cim_type.lower():
                            results.append(
                                {
                                    "id": eq["mrid"],
                                    "name": eq.get("name") or eq["mrid"],
                                    "type": "equipment",
                                    "model_id": mid,
                                    "cim_type": cim_type,
                                }
                            )
                    if len(results) >= 50:
                        break
                if len(results) >= 50:
                    break

            # Search edges
            if len(results) < 50:
                for edge in mgr.get_topology_edges():
                    name = (edge.get("name") or "").lower()
                    edge_id = edge.get("edge_id", "").lower()
                    edge_type = (edge.get("edge_type") or "").lower()

                    if (
                        clean_query in name
                        or clean_query in edge_id
                        or clean_query in edge_type
                    ):
                        cim_type = edge.get("edge_type", "Edge")
                        if not lower_class or lower_class in cim_type.lower():
                            results.append(
                                {
                                    "id": edge["edge_id"],
                                    "name": edge.get("name") or edge["edge_id"],
                                    "type": "edge",
                                    "model_id": mid,
                                    "cim_type": cim_type,
                                }
                            )
                    if len(results) >= 50:
                        break

            # Limit search results to avoid massive responses
            if len(results) >= 50:
                break

        return results

    def get_cim_schema(self) -> dict:
        """Aggregate CIM schema from all active models, falling back to profile baseline."""
        # 1. Start with the baseline schema from the CIM profile
        combined_schema = self._profile.get_baseline_schema().copy()
        
        # 2. Layer on actual instance data from loaded models
        for _mid, mgr in self.get_managers():
            if hasattr(mgr, "get_cim_schema"):
                mgr_schema = mgr.get_cim_schema()
                for cls_name, cls_info in mgr_schema.items():
                    if cls_name not in combined_schema or combined_schema[cls_name]["count"] == 0:
                        combined_schema[cls_name] = cls_info
                    else:
                        # Existing class - merge attributes and add to count
                        existing_attrs = {
                            a["name"] for a in combined_schema[cls_name]["attributes"]
                        }
                        for attr in cls_info["attributes"]:
                            if attr["name"] not in existing_attrs:
                                combined_schema[cls_name]["attributes"].append(attr)
                        combined_schema[cls_name]["count"] += cls_info.get("count", 0)
        return combined_schema

    def get_class_connections(self, class_name: str) -> list[str]:
        """Discovery of classes attached to a given class (static + dynamic)."""
        # Static baseline from profile
        connections = set(self._profile.get_static_connections(class_name))
        
        # Dynamic discovery from active models
        for _mid, mgr in self.get_managers():
            if hasattr(mgr, "get_class_connections"):
                connections.update(mgr.get_class_connections(class_name))
                
        return sorted(list(connections))


    def get_combined_topology(
        self, model_ids: list[str] | None = None
    ) -> tuple[list[dict], list[dict]]:
        """Merge topology from requested models.

        Each node/edge gets a ``model_id`` tag. When multiple models are
        combined their coordinate spaces are shifted so they don't
        overlap on the map.

        Returns (nodes, edges).
        """
        managers = self.get_managers(model_ids)
        if len(managers) == 0:
            return [], []

        if len(managers) == 1:
            mid, mgr = managers[0]
            nodes = [dict(n, model_id=mid) for n in mgr.get_topology_nodes()]
            edges = [dict(e, model_id=mid) for e in mgr.get_topology_edges()]
            return nodes, edges

        # Multiple models — apply coordinate offsets
        all_nodes: list[dict] = []
        all_edges: list[dict] = []

        for mid, mgr in managers:
            lat_off, lon_off = self._coordinate_offsets.get(mid, (0.0, 0.0))
            for n in mgr.get_topology_nodes():
                shifted = dict(n, model_id=mid)
                shifted["latitude"] = n["latitude"] + lat_off
                shifted["longitude"] = n["longitude"] + lon_off
                all_nodes.append(shifted)
            for e in mgr.get_topology_edges():
                all_edges.append(dict(e, model_id=mid))

        return all_nodes, all_edges

    # ── Private helpers ───────────────────────────────────────────

    def _get_meta(self, feeder_id: str) -> Optional[dict]:
        for m in self._available:
            if m["feeder_id"] == feeder_id:
                return m
        return None

    def _recalculate_offsets(self):
        """Space active models side-by-side with ~0.15° gaps."""
        active = sorted(self._active_models)
        self._coordinate_offsets.clear()
        for i, mid in enumerate(active):
            # First model at origin, subsequent models shifted east
            self._coordinate_offsets[mid] = (0.0, i * 0.15)
