"""CIM Model Registry — manages multiple CIM models loaded in memory.

Discovers XML files in sample_data/ and provides a unified API to:
* List available / loaded models
* Load / unload individual models
* Query topology from one, many, or all models (with combined view)

Each model gets its own CimModelManager instance so phase indexes,
equipment lookups, and topology are fully independent.
"""

import glob
import logging
import os
from pathlib import Path
from typing import Optional

from src.shared.cim_model import CimModelManager, _mrid_str

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Path helpers
# ---------------------------------------------------------------------------
_SHARED_DIR = Path(__file__).resolve().parent
_BACKEND_DIR = _SHARED_DIR.parents[1]
_WORKSPACE_ROOT = _BACKEND_DIR.parent

_CIM_DATA_DIR = _BACKEND_DIR / "cim" / "models"


def _discover_xml_files() -> list[dict]:
    """Find all CIM XML files in the cim directory."""
    results: list[dict] = []
    search_dir = os.getenv("CIM_MODELS_DIR", str(_CIM_DATA_DIR))

    for xml_path in sorted(glob.glob(os.path.join(search_dir, "*.xml"))):
        p = Path(xml_path)
        model_id = p.stem  # e.g. "IEEE8500_3subs"
        results.append({
            "model_id": model_id,
            "filename": p.name,
            "path": str(p),
            "size_mb": round(p.stat().st_size / 1_048_576, 1),
        })

    return results


# ═══════════════════════════════════════════════════════════════════════════
# CimModelRegistry
# ═══════════════════════════════════════════════════════════════════════════

class CimModelRegistry:
    """Singleton registry that holds multiple named CimModelManager instances."""

    _instance: Optional["CimModelRegistry"] = None

    def __init__(self):
        self._managers: dict[str, CimModelManager] = {}  # model_id → manager
        self._available: list[dict] = []                  # discovered XML metadata
        self._active_models: set[str] = set()             # currently loaded model_ids
        self._coordinate_offsets: dict[str, tuple[float, float]] = {}  # model_id → (lat_offset, lon_offset)

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
        """Scan for available XML files and populate the available list."""
        self._available = _discover_xml_files()
        logger.info(
            "Discovered %d CIM XML files: %s",
            len(self._available),
            [m["model_id"] for m in self._available],
        )

    # ── Load / Unload ─────────────────────────────────────────────

    def load_model(self, model_id: str) -> CimModelManager:
        """Load a specific model by ID. No-op if already loaded."""
        if model_id in self._managers and self._managers[model_id].is_loaded:
            logger.info("Model '%s' already loaded", model_id)
            return self._managers[model_id]

        meta = self._get_meta(model_id)
        if meta is None:
            raise FileNotFoundError(f"No discovered model with id '{model_id}'")

        manager = CimModelManager()
        manager.load(xml_path=meta["path"])
        self._managers[model_id] = manager
        self._active_models.add(model_id)

        # Assign coordinate offsets so combined models don't overlap
        self._recalculate_offsets()

        logger.info("Model '%s' loaded (%d nodes, %d edges)",
                     model_id,
                     len(manager.get_topology_nodes()),
                     len(manager.get_topology_edges()))
        return manager

    def unload_model(self, model_id: str):
        """Unload a model, freeing memory."""
        if model_id in self._managers:
            del self._managers[model_id]
            self._active_models.discard(model_id)
            self._recalculate_offsets()
            logger.info("Model '%s' unloaded", model_id)

    def load_all(self):
        """Load all discovered CIM XML files into memory."""
        self.discover()
        if not self._available:
            logger.warning("No CIM XML files discovered in %s", _CIM_DATA_DIR)
            return

        for meta in self._available:
            try:
                self.load_model(meta["model_id"])
            except Exception as e:
                logger.error("Failed to load model '%s': %s", meta["model_id"], e)

    # ── Query ─────────────────────────────────────────────────────

    def list_models(self) -> list[dict]:
        """Return metadata for all discovered models with loaded status."""
        result = []
        for meta in self._available:
            mid = meta["model_id"]
            mgr = self._managers.get(mid)
            result.append({
                **meta,
                "loaded": mid in self._active_models,
                "node_count": len(mgr.get_topology_nodes()) if mgr and mgr.is_loaded else 0,
                "edge_count": len(mgr.get_topology_edges()) if mgr and mgr.is_loaded else 0,
            })
        return result

    def get_active_model_ids(self) -> list[str]:
        """IDs of all currently loaded models."""
        return sorted(self._active_models)

    def get_manager(self, model_id: str) -> Optional[CimModelManager]:
        """Get a specific loaded manager, or None."""
        return self._managers.get(model_id)

    def get_managers(self, model_ids: list[str] | None = None) -> list[tuple[str, CimModelManager]]:
        """Get (model_id, manager) pairs for requested models.

        If model_ids is None or empty, returns all active managers.
        """
        if not model_ids:
            return [(mid, mgr) for mid, mgr in self._managers.items()
                    if mid in self._active_models]
        return [(mid, self._managers[mid]) for mid in model_ids
                if mid in self._managers]

    # ── Combined topology ─────────────────────────────────────────

    def search_all_models(self, query: str) -> list[dict]:
        """Search across all loaded models for nodes or equipment matching the query."""
        results = []
        lower_query = query.lower()
        
        for mid, mgr in self.get_managers():
            # Search nodes
            for node in mgr.get_topology_nodes():
                name = (node.get("name") or "").lower()
                node_id = node.get("node_id", "").lower()
                node_type = (node.get("node_type") or "").lower()
                
                if (lower_query in name or 
                    lower_query in node_id or 
                    lower_query in node_type):
                    results.append({
                        "id": node["node_id"],
                        "name": node.get("name") or node["node_id"],
                        "type": "node",
                        "model_id": mid,
                        "cim_type": node.get("node_type", "ConnectivityNode")
                    })
                
                # Search attached equipment within nodes
                for eq in node.get("attached_equipment", []):
                    eq_name = (eq.get("name") or "").lower()
                    eq_id = eq.get("mrid", "").lower()
                    eq_type = (eq.get("type") or "").lower()
                    
                    if (lower_query in eq_name or 
                        lower_query in eq_id or 
                        lower_query in eq_type):
                        results.append({
                            "id": eq["mrid"],
                            "name": eq.get("name") or eq["mrid"],
                            "type": "equipment",
                            "model_id": mid,
                            "cim_type": eq.get("type", "Equipment")
                        })
                    if len(results) >= 50: break
                if len(results) >= 50: break

            # Search edges
            if len(results) < 50:
                for edge in mgr.get_topology_edges():
                    name = (edge.get("name") or "").lower()
                    edge_id = edge.get("edge_id", "").lower()
                    edge_type = (edge.get("edge_type") or "").lower()
                    
                    if (lower_query in name or 
                        lower_query in edge_id or 
                        lower_query in edge_type):
                        results.append({
                            "id": edge["edge_id"],
                            "name": edge.get("name") or edge["edge_id"],
                            "type": "edge",
                            "model_id": mid,
                            "cim_type": edge.get("edge_type", "Edge")
                        })
                    if len(results) >= 50: break
            
            # Limit search results to avoid massive responses
            if len(results) >= 50:
                break
                
        return results

    def get_combined_topology(self, model_ids: list[str] | None = None) -> tuple[list[dict], list[dict]]:
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

    def _get_meta(self, model_id: str) -> Optional[dict]:
        for m in self._available:
            if m["model_id"] == model_id:
                return m
        return None

    def _recalculate_offsets(self):
        """Space active models side-by-side with ~0.15° gaps."""
        active = sorted(self._active_models)
        self._coordinate_offsets.clear()
        for i, mid in enumerate(active):
            # First model at origin, subsequent models shifted east
            self._coordinate_offsets[mid] = (0.0, i * 0.15)
