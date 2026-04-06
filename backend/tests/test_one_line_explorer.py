"""Tests for the one_line_explorer plugin endpoint.

Covers:
- Upstream path tracing from EnergySource to selected node (no depth cap)
- Depth-limited downstream BFS from selected node
- node_role classification (upstream / centre / downstream)
- source_path field in response
- Response shape validation
- 404 for unknown node
"""
import os
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient

# Enable the plugin before importing main so the route is registered
os.environ["plugin.one_line_explorer.enabled"] = "true"

from main import app  # noqa: E402 — must come after env var is set

client = TestClient(app)

# ── Synthetic topology fixtures ───────────────────────────────────────────────

# Layout:
#
#   SOURCE ── tr1 ── BUS_A ── line1 ── BUS_B ── line2 ── BUS_C
#                       |
#                     line3
#                       |
#                     BUS_D ── line4 ── BUS_E
#
# Hops from BUS_A:
#   depth=1 → {SOURCE, BUS_A, BUS_B, BUS_D}
#   depth=2 → {SOURCE, BUS_A, BUS_B, BUS_C, BUS_D, BUS_E}

MOCK_NODES = [
    {"node_id": "SOURCE", "node_type": "Substation", "name": "Source",
     "phases": ["A", "B", "C"], "latitude": 33.100, "longitude": -117.100,
     "base_voltage_kv": 12.47, "attached_equipment": [
         {"mrid": "es1", "type": "EnergySource", "name": "Grid Source", "phases": ["A", "B", "C"]}
     ]},
    {"node_id": "BUS_A", "node_type": "Bus", "name": "Bus A",
     "phases": ["A", "B", "C"], "latitude": 33.101, "longitude": -117.101,
     "base_voltage_kv": 12.47, "attached_equipment": [
         {"mrid": "ec1", "type": "EnergyConsumer", "name": "Load 1", "phases": ["A"]}
     ]},
    {"node_id": "BUS_B", "node_type": "Bus", "name": "Bus B",
     "phases": ["A", "B", "C"], "latitude": 33.102, "longitude": -117.102,
     "base_voltage_kv": None, "attached_equipment": []},
    {"node_id": "BUS_C", "node_type": "Bus", "name": "Bus C",
     "phases": ["A", "B", "C"], "latitude": 33.103, "longitude": -117.103,
     "base_voltage_kv": None, "attached_equipment": []},
    {"node_id": "BUS_D", "node_type": "Bus", "name": "Bus D",
     "phases": ["A", "B", "C"], "latitude": 33.104, "longitude": -117.104,
     "base_voltage_kv": None, "attached_equipment": []},
    {"node_id": "BUS_E", "node_type": "Bus", "name": "Bus E",
     "phases": ["A", "B", "C"], "latitude": 33.105, "longitude": -117.105,
     "base_voltage_kv": None, "attached_equipment": []},
]

MOCK_EDGES = [
    {"edge_id": "tr1", "edge_type": "PowerTransformer",
     "from_node_id": "SOURCE", "to_node_id": "BUS_A",
     "name": "T1", "phases": ["A", "B", "C"], "transformer_kva": 500.0},
    {"edge_id": "line1", "edge_type": "ACLineSegment",
     "from_node_id": "BUS_A", "to_node_id": "BUS_B",
     "name": "L1", "phases": ["A", "B", "C"], "length_m": 150.0},
    {"edge_id": "line2", "edge_type": "ACLineSegment",
     "from_node_id": "BUS_B", "to_node_id": "BUS_C",
     "name": "L2", "phases": ["A", "B", "C"], "length_m": 80.0},
    {"edge_id": "line3", "edge_type": "ACLineSegment",
     "from_node_id": "BUS_A", "to_node_id": "BUS_D",
     "name": "L3", "phases": ["A", "B", "C"], "length_m": 60.0},
    {"edge_id": "line4", "edge_type": "ACLineSegment",
     "from_node_id": "BUS_D", "to_node_id": "BUS_E",
     "name": "L4", "phases": ["A", "B", "C"], "length_m": 120.0},
]


def _mock_topology(_model_ids=None):
    """Return synthetic (nodes, edges) mimicking registry.get_combined_topology."""
    return MOCK_NODES, MOCK_EDGES


def _build_graph_engine():
    """Actually build graph_engine from synthetic data so flow_depth is populated."""
    from src.grid.graph_node import GraphNode
    from src.shared.dependencies import graph_engine

    nodes = [
        GraphNode(
            id=n["node_id"],
            type=n["node_type"],
            name=n["name"],
            phases=n.get("phases", ["A", "B", "C"]),
            latitude=n["latitude"],
            longitude=n["longitude"],
            attached_equipment=n.get("attached_equipment", []),
            base_voltage_kv=n.get("base_voltage_kv"),
        )
        for n in MOCK_NODES
    ]
    graph_engine.build_graph(nodes=nodes, edges=MOCK_EDGES)
    return graph_engine


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def _patch_registry():
    """Patch registry and graph-built guard so all tests use synthetic data.

    NOTE: ensure_graph_built is mocked to a no-op here, so graph_engine.flow_depth
    is EMPTY.  Tests that need the primary find_upstream path must also use the
    _with_real_graph fixture which directly populates graph_engine.
    """
    with (
        patch("plugins.one_line_explorer.routes.registry.get_combined_topology",
              side_effect=_mock_topology),
        patch("plugins.one_line_explorer.routes.ensure_graph_built"),
        patch("plugins.one_line_explorer.routes.get_active_model_ids",
              return_value=["test_model"]),
    ):
        yield


@pytest.fixture
def _with_real_graph():
    """Build graph_engine with real flow_depth from synthetic data.

    Works alongside the autouse _patch_registry fixture: ensure_graph_built is
    still mocked (so the endpoint doesn't re-build), but graph_engine is
    pre-populated here so flow_depth is available for the primary code path.
    """
    from src.shared.dependencies import graph_engine as ge
    _build_graph_engine()
    yield
    ge.build_graph()  # reset to empty after test


class TestOneLineDiagramEndpoint:
    def test_default_depth_returns_two_hop_nodes(self):
        resp = client.get("/api/plugins/one-line-explorer/diagram/BUS_A")
        assert resp.status_code == 200, resp.text
        data = resp.json()

        node_ids = {n["id"] for n in data["nodes"]}
        # depth=2 from BUS_A should include SOURCE, BUS_A, BUS_B, BUS_C, BUS_D, BUS_E
        assert node_ids == {"SOURCE", "BUS_A", "BUS_B", "BUS_C", "BUS_D", "BUS_E"}

    def test_depth_one_returns_one_hop_nodes(self):
        resp = client.get("/api/plugins/one-line-explorer/diagram/BUS_A?depth=1")
        assert resp.status_code == 200
        data = resp.json()

        node_ids = {n["id"] for n in data["nodes"]}
        assert node_ids == {"SOURCE", "BUS_A", "BUS_B", "BUS_D"}

    def test_centre_node_is_flagged(self):
        resp = client.get("/api/plugins/one-line-explorer/diagram/BUS_A")
        assert resp.status_code == 200
        data = resp.json()

        centre_nodes = [n for n in data["nodes"] if n["is_centre"]]
        assert len(centre_nodes) == 1
        assert centre_nodes[0]["id"] == "BUS_A"

    def test_centre_id_in_response(self):
        resp = client.get("/api/plugins/one-line-explorer/diagram/BUS_A")
        assert resp.status_code == 200
        data = resp.json()
        assert data["centre_id"] == "BUS_A"
        assert data["depth"] == 2

    def test_edges_within_subgraph_only(self):
        resp = client.get("/api/plugins/one-line-explorer/diagram/BUS_A?depth=1")
        assert resp.status_code == 200
        data = resp.json()

        node_ids = {n["id"] for n in data["nodes"]}
        for edge in data["edges"]:
            assert edge["from_node_id"] in node_ids
            assert edge["to_node_id"] in node_ids

        # line2 (BUS_B→BUS_C) and line4 (BUS_D→BUS_E) must NOT appear at depth=1
        edge_ids = {e["id"] for e in data["edges"]}
        assert "line2" not in edge_ids
        assert "line4" not in edge_ids

    def test_attached_equipment_included_on_nodes(self):
        resp = client.get("/api/plugins/one-line-explorer/diagram/BUS_A")
        assert resp.status_code == 200
        data = resp.json()

        bus_a = next(n for n in data["nodes"] if n["id"] == "BUS_A")
        assert len(bus_a["attached_equipment"]) == 1
        assert bus_a["attached_equipment"][0]["type"] == "EnergyConsumer"

    def test_transformer_edge_type_preserved(self):
        resp = client.get("/api/plugins/one-line-explorer/diagram/BUS_A")
        assert resp.status_code == 200
        data = resp.json()

        transformer_edges = [e for e in data["edges"] if e["edge_type"] == "PowerTransformer"]
        assert len(transformer_edges) == 1
        assert transformer_edges[0]["transformer_kva"] == 500.0

    def test_unknown_node_returns_404(self):
        resp = client.get("/api/plugins/one-line-explorer/diagram/NONEXISTENT_NODE")
        assert resp.status_code == 404

    def test_depth_query_param_enforced(self):
        # depth=0 is below the minimum (ge=1)
        resp = client.get("/api/plugins/one-line-explorer/diagram/BUS_A?depth=0")
        assert resp.status_code == 422

        # depth=11 is above the maximum (le=10)
        resp = client.get("/api/plugins/one-line-explorer/diagram/BUS_A?depth=11")
        assert resp.status_code == 422


class TestUpstreamPath:
    """Verify source tracing and node_role classification."""

    def test_source_path_in_response(self):
        resp = client.get("/api/plugins/one-line-explorer/diagram/BUS_A")
        assert resp.status_code == 200
        data = resp.json()
        # SOURCE has EnergySource; BUS_A is one hop away
        assert data["source_path"] == ["SOURCE", "BUS_A"]

    def test_source_path_deeper_node(self):
        """BUS_B is two hops from SOURCE; path should traverse BUS_A."""
        resp = client.get("/api/plugins/one-line-explorer/diagram/BUS_B")
        assert resp.status_code == 200
        data = resp.json()
        assert data["source_path"] == ["SOURCE", "BUS_A", "BUS_B"]

    def test_source_path_fallback_when_no_source(self):
        """If selected node is the EnergySource itself, path is just [node_id]."""
        resp = client.get("/api/plugins/one-line-explorer/diagram/SOURCE")
        assert resp.status_code == 200
        data = resp.json()
        assert data["source_path"] == ["SOURCE"]

    def test_node_role_centre(self):
        resp = client.get("/api/plugins/one-line-explorer/diagram/BUS_A")
        data = resp.json()
        centre = next(n for n in data["nodes"] if n["id"] == "BUS_A")
        assert centre["node_role"] == "centre"

    def test_node_role_upstream(self):
        resp = client.get("/api/plugins/one-line-explorer/diagram/BUS_A")
        data = resp.json()
        source = next(n for n in data["nodes"] if n["id"] == "SOURCE")
        assert source["node_role"] == "upstream"

    def test_node_role_downstream(self):
        resp = client.get("/api/plugins/one-line-explorer/diagram/BUS_A")
        data = resp.json()
        bus_b = next(n for n in data["nodes"] if n["id"] == "BUS_B")
        assert bus_b["node_role"] == "downstream"

    def test_upstream_nodes_included_beyond_depth(self):
        """Selecting BUS_B: SOURCE is 2 hops upstream; with depth=1 it should
        still appear because the upstream path has no depth cap."""
        resp = client.get("/api/plugins/one-line-explorer/diagram/BUS_B?depth=1")
        assert resp.status_code == 200
        data = resp.json()
        node_ids = {n["id"] for n in data["nodes"]}
        # SOURCE is 2 hops from BUS_B but must be included via upstream path
        assert "SOURCE" in node_ids

    def test_downstream_respects_depth(self):
        """Selecting BUS_B with depth=1: only BUS_C (1 hop downstream) should
        appear, not BUS_D/BUS_E which are downstream of BUS_A."""
        resp = client.get("/api/plugins/one-line-explorer/diagram/BUS_B?depth=1")
        data = resp.json()
        node_ids = {n["id"] for n in data["nodes"]}
        assert "BUS_C" in node_ids      # 1 hop downstream of BUS_B
        assert "BUS_E" not in node_ids  # too far


class TestUpstreamWithRealGraph:
    """Exercise the primary find_upstream path with graph_engine.flow_depth populated.

    These tests mirror TestUpstreamPath but use the real graph_engine so the
    graph_engine.find_upstream() code path (not the fallback) is exercised.
    """

    def test_flow_depth_is_populated(self, _with_real_graph):
        from src.shared.dependencies import graph_engine
        assert graph_engine.flow_depth, "flow_depth must be non-empty after build"
        assert graph_engine.flow_depth.get("SOURCE") == 0
        assert graph_engine.flow_depth.get("BUS_A") == 1
        assert graph_engine.flow_depth.get("BUS_B") == 2
        assert graph_engine.flow_depth.get("BUS_C") == 3

    def test_source_path_uses_find_upstream(self, _with_real_graph):
        resp = client.get("/api/plugins/one-line-explorer/diagram/BUS_A")
        assert resp.status_code == 200
        data = resp.json()
        assert data["source_path"] == ["SOURCE", "BUS_A"]

    def test_deep_node_traces_full_chain(self, _with_real_graph):
        """BUS_C is 3 hops from SOURCE; source_path must include the full chain."""
        resp = client.get("/api/plugins/one-line-explorer/diagram/BUS_C")
        assert resp.status_code == 200
        data = resp.json()
        # Exact path: SOURCE(0) → BUS_A(1) → BUS_B(2) → BUS_C(3)
        assert data["source_path"] == ["SOURCE", "BUS_A", "BUS_B", "BUS_C"]

    def test_upstream_nodes_all_present(self, _with_real_graph):
        """Selecting BUS_C depth=1: SOURCE/BUS_A/BUS_B must appear via upstream
        even though they are >1 hop away."""
        resp = client.get("/api/plugins/one-line-explorer/diagram/BUS_C?depth=1")
        assert resp.status_code == 200
        data = resp.json()
        node_ids = {n["id"] for n in data["nodes"]}
        assert {"SOURCE", "BUS_A", "BUS_B", "BUS_C"}.issubset(node_ids)

    def test_node_roles_with_real_graph(self, _with_real_graph):
        resp = client.get("/api/plugins/one-line-explorer/diagram/BUS_B")
        data = resp.json()
        roles = {n["id"]: n["node_role"] for n in data["nodes"]}
        assert roles["SOURCE"] == "upstream"
        assert roles["BUS_A"] == "upstream"
        assert roles["BUS_B"] == "centre"
        assert roles["BUS_C"] == "downstream"


# ── Distribution transformer topology ────────────────────────────────────────
#
# A secondary bus on the load side of a distribution transformer:
#
#   SOURCE ── feeder_line ── PRIMARY_BUS ── dist_tr ── SECONDARY_BUS ── svc_line ── LOAD_BUS
#
# When the user selects SECONDARY_BUS the diagram must show:
#   - SOURCE and PRIMARY_BUS as upstream (above SECONDARY_BUS)
#   - LOAD_BUS as downstream
#   - source_path = [SOURCE, PRIMARY_BUS, SECONDARY_BUS]
#   - The BFS layout root is SOURCE (not SECONDARY_BUS)

DIST_TR_NODES = [
    {"node_id": "SOURCE2", "node_type": "Substation", "name": "Source 2",
     "phases": ["A", "B", "C"], "latitude": 34.100, "longitude": -118.100,
     "base_voltage_kv": 12.47, "attached_equipment": [
         {"mrid": "es2", "type": "EnergySource", "name": "Grid Source 2", "phases": ["A", "B", "C"]}
     ]},
    {"node_id": "PRIMARY_BUS", "node_type": "Bus", "name": "Primary Bus",
     "phases": ["A", "B", "C"], "latitude": 34.101, "longitude": -118.101,
     "base_voltage_kv": 12.47, "attached_equipment": []},
    {"node_id": "SECONDARY_BUS", "node_type": "Bus", "name": "Secondary Bus",
     "phases": ["A", "B", "C"], "latitude": 34.102, "longitude": -118.102,
     "base_voltage_kv": 0.24, "attached_equipment": []},
    {"node_id": "LOAD_BUS", "node_type": "Bus", "name": "Load Bus",
     "phases": ["A", "B", "C"], "latitude": 34.103, "longitude": -118.103,
     "base_voltage_kv": 0.24, "attached_equipment": [
         {"mrid": "ec2", "type": "EnergyConsumer", "name": "Customer", "phases": ["A", "B", "C"]}
     ]},
]

DIST_TR_EDGES = [
    {"edge_id": "feeder_line", "edge_type": "ACLineSegment",
     "from_node_id": "SOURCE2", "to_node_id": "PRIMARY_BUS",
     "name": "Feeder Line", "phases": ["A", "B", "C"], "length_m": 500.0},
    {"edge_id": "dist_tr", "edge_type": "PowerTransformer",
     "from_node_id": "PRIMARY_BUS", "to_node_id": "SECONDARY_BUS",
     "name": "Dist Transformer", "phases": ["A", "B", "C"], "transformer_kva": 25.0},
    {"edge_id": "svc_line", "edge_type": "ACLineSegment",
     "from_node_id": "SECONDARY_BUS", "to_node_id": "LOAD_BUS",
     "name": "Service Line", "phases": ["A", "B", "C"], "length_m": 30.0},
]


def _mock_dist_tr_topology(_model_ids=None):
    return DIST_TR_NODES, DIST_TR_EDGES


def _build_dist_tr_graph_engine():
    from src.grid.graph_node import GraphNode
    from src.shared.dependencies import graph_engine

    nodes = [
        GraphNode(
            id=n["node_id"],
            type=n["node_type"],
            name=n["name"],
            phases=n.get("phases", ["A", "B", "C"]),
            latitude=n["latitude"],
            longitude=n["longitude"],
            attached_equipment=n.get("attached_equipment", []),
            base_voltage_kv=n.get("base_voltage_kv"),
        )
        for n in DIST_TR_NODES
    ]
    graph_engine.build_graph(nodes=nodes, edges=DIST_TR_EDGES)
    return graph_engine


@pytest.fixture
def _dist_tr_topology(monkeypatch):
    """Patch registry and build graph_engine for the distribution transformer topology."""
    from src.shared.dependencies import graph_engine as ge
    monkeypatch.setattr(
        "plugins.one_line_explorer.routes.registry.get_combined_topology",
        _mock_dist_tr_topology,
    )
    _build_dist_tr_graph_engine()
    yield
    ge.build_graph()


class TestDistributionTransformerUpstream:
    """Selecting the secondary bus of a distribution transformer must show
    the primary bus and feeder source as upstream — not downstream."""

    def test_secondary_bus_source_path_includes_full_upstream(self, _dist_tr_topology):
        resp = client.get("/api/plugins/one-line-explorer/diagram/SECONDARY_BUS")
        assert resp.status_code == 200
        data = resp.json()
        # Full path from SOURCE2 through PRIMARY_BUS to SECONDARY_BUS
        assert data["source_path"] == ["SOURCE2", "PRIMARY_BUS", "SECONDARY_BUS"]

    def test_primary_bus_is_upstream_not_downstream(self, _dist_tr_topology):
        resp = client.get("/api/plugins/one-line-explorer/diagram/SECONDARY_BUS")
        data = resp.json()
        roles = {n["id"]: n["node_role"] for n in data["nodes"]}
        assert roles["SOURCE2"] == "upstream"
        assert roles["PRIMARY_BUS"] == "upstream"
        assert roles["SECONDARY_BUS"] == "centre"
        assert roles["LOAD_BUS"] == "downstream"

    def test_dist_transformer_edge_present(self, _dist_tr_topology):
        resp = client.get("/api/plugins/one-line-explorer/diagram/SECONDARY_BUS")
        data = resp.json()
        tr_edges = [e for e in data["edges"] if e["edge_type"] == "PowerTransformer"]
        assert len(tr_edges) == 1
        assert tr_edges[0]["transformer_kva"] == 25.0

    def test_upstream_nodes_not_depth_capped(self, _dist_tr_topology):
        """With depth=1, upstream nodes (SOURCE2, PRIMARY_BUS) must still appear."""
        resp = client.get("/api/plugins/one-line-explorer/diagram/SECONDARY_BUS?depth=1")
        assert resp.status_code == 200
        data = resp.json()
        node_ids = {n["id"] for n in data["nodes"]}
        assert "SOURCE2" in node_ids
        assert "PRIMARY_BUS" in node_ids
        assert "SECONDARY_BUS" in node_ids


# ── No-source-node topology (edge-direction-only upstream) ───────────────────
#
# Models the real-world case where NO EnergySource / Substation nodes exist in
# the loaded CIM data — so flow_depth is always empty.  Upstream direction must
# be inferred purely from CIM edge orientation (from_node_id → to_node_id =
# source → load).
#
#   FEEDER_HEAD ── seg_a ── MID_BUS ── seg_b ── END_BUS ── seg_c ── LEAF_BUS
#
# All node_types are "Bus" (no Substation, no EnergySource attached).
# The topology engine will have empty flow_depth but populated _reverse_adj.

NO_SRC_NODES = [
    {"node_id": "FEEDER_HEAD", "node_type": "Bus", "name": "Feeder Head",
     "phases": ["A", "B", "C"], "latitude": 35.100, "longitude": -120.100,
     "base_voltage_kv": 12.47, "attached_equipment": []},
    {"node_id": "MID_BUS", "node_type": "Bus", "name": "Mid Bus",
     "phases": ["A", "B", "C"], "latitude": 35.101, "longitude": -120.101,
     "base_voltage_kv": 12.47, "attached_equipment": []},
    {"node_id": "END_BUS", "node_type": "Bus", "name": "End Bus",
     "phases": ["A", "B", "C"], "latitude": 35.102, "longitude": -120.102,
     "base_voltage_kv": 12.47, "attached_equipment": []},
    {"node_id": "LEAF_BUS", "node_type": "Bus", "name": "Leaf Bus",
     "phases": ["A", "B", "C"], "latitude": 35.103, "longitude": -120.103,
     "base_voltage_kv": 12.47, "attached_equipment": []},
]

NO_SRC_EDGES = [
    {"edge_id": "seg_a", "edge_type": "ACLineSegment",
     "from_node_id": "FEEDER_HEAD", "to_node_id": "MID_BUS",
     "name": "Seg A", "phases": ["A", "B", "C"], "length_m": 300.0},
    {"edge_id": "seg_b", "edge_type": "ACLineSegment",
     "from_node_id": "MID_BUS", "to_node_id": "END_BUS",
     "name": "Seg B", "phases": ["A", "B", "C"], "length_m": 400.0},
    {"edge_id": "seg_c", "edge_type": "ACLineSegment",
     "from_node_id": "END_BUS", "to_node_id": "LEAF_BUS",
     "name": "Seg C", "phases": ["A", "B", "C"], "length_m": 200.0},
]


def _mock_no_src_topology(_model_ids=None):
    return NO_SRC_NODES, NO_SRC_EDGES


@pytest.fixture
def _no_src_topology(monkeypatch):
    """Patch registry and build graph_engine for the no-source topology.

    graph_engine.flow_depth will be EMPTY because there are no Substation /
    EnergySource nodes — this exercises the directed reverse-edge BFS path.
    """
    from src.grid.graph_node import GraphNode
    from src.shared.dependencies import graph_engine as ge

    monkeypatch.setattr(
        "plugins.one_line_explorer.routes.registry.get_combined_topology",
        _mock_no_src_topology,
    )

    nodes = [
        GraphNode(
            id=n["node_id"], type=n["node_type"], name=n["name"],
            phases=n.get("phases", ["A", "B", "C"]),
            latitude=n["latitude"], longitude=n["longitude"],
            attached_equipment=[], base_voltage_kv=n.get("base_voltage_kv"),
        )
        for n in NO_SRC_NODES
    ]
    ge.build_graph(nodes=nodes, edges=NO_SRC_EDGES)
    yield
    ge.build_graph()


class TestNoSourceNodeUpstream:
    """When no EnergySource/Substation nodes exist, upstream must be found
    via directed reverse-edge BFS (CIM edge orientation = source → load)."""

    def test_flow_depth_is_empty(self, _no_src_topology):
        from src.shared.dependencies import graph_engine as ge
        assert ge.flow_depth == {}, "flow_depth must be empty when no source nodes exist"

    def test_upstream_found_by_edge_direction(self, _no_src_topology):
        """END_BUS: FEEDER_HEAD and MID_BUS must be upstream (not downstream)."""
        resp = client.get("/api/plugins/one-line-explorer/diagram/END_BUS")
        assert resp.status_code == 200
        data = resp.json()
        assert "FEEDER_HEAD" in data["source_path"]
        assert "MID_BUS" in data["source_path"]
        assert data["source_path"][-1] == "END_BUS"

    def test_upstream_roles_correct(self, _no_src_topology):
        resp = client.get("/api/plugins/one-line-explorer/diagram/END_BUS")
        data = resp.json()
        roles = {n["id"]: n["node_role"] for n in data["nodes"]}
        assert roles["FEEDER_HEAD"] == "upstream"
        assert roles["MID_BUS"] == "upstream"
        assert roles["END_BUS"] == "centre"
        assert roles["LEAF_BUS"] == "downstream"

    def test_feeder_head_is_first_in_source_path(self, _no_src_topology):
        """The most upstream node (FEEDER_HEAD) must be the BFS root (index 0)."""
        resp = client.get("/api/plugins/one-line-explorer/diagram/END_BUS")
        data = resp.json()
        assert data["source_path"][0] == "FEEDER_HEAD"
