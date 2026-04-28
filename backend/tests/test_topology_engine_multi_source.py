"""
Tests for TopologyEngine behaviour when multiple EnergySources exist.

Regression test for: find_downstream incorrectly traversing into adjacent
feeders when multiple generation sources are present (e.g. 9500-node model).

Topology used in these tests
─────────────────────────────
Feeder A:  SRC_A → A1 → A2 → A3
Feeder B:  SRC_B → B1 → B2 → B3

Both feeders are disconnected (no shared nodes), but they coexist in the same
graph.  With multiple sources, the old global-Dijkstra approach could assign
flow depths that bleed across feeders.  The new per-query anchored approach
must keep each feeder's traversal independent.

A second topology tests the correct EnergySource selection when the connected
sources have different voltages — the highest-voltage one must be preferred.
"""
import pytest
from src.grid.topology_engine import TopologyEngine
from src.grid.graph_node import GraphNode


# ── Helpers ──────────────────────────────────────────────────────────────────

def _node(nid: str, kv: float = 4.16, equipment: list = None) -> GraphNode:
    return GraphNode(
        id=nid,
        type="Bus",
        name=nid,
        base_voltage_kv=kv,
        attached_equipment=equipment or [],
    )


def _energy_source_node(nid: str, kv: float) -> GraphNode:
    return GraphNode(
        id=nid,
        type="Bus",
        name=nid,
        base_voltage_kv=kv,
        attached_equipment=[{"type": "EnergySource", "name": f"src_{nid}"}],
    )


def _edge(src: str, dst: str, eid: str = None) -> dict:
    return {
        "from_node_id": src,
        "to_node_id": dst,
        "edge_id": eid or f"{src}__{dst}",
    }


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestMultiSourceDownstream:
    """Downstream traversal stays within the correct feeder."""

    @pytest.fixture
    def engine(self):
        nodes = [
            _energy_source_node("SRC_A", kv=12.47),
            _node("A1"), _node("A2"), _node("A3"),
            _energy_source_node("SRC_B", kv=12.47),
            _node("B1"), _node("B2"), _node("B3"),
        ]
        edges = [
            _edge("SRC_A", "A1"), _edge("A1", "A2"), _edge("A2", "A3"),
            _edge("SRC_B", "B1"), _edge("B1", "B2"), _edge("B2", "B3"),
        ]
        eng = TopologyEngine()
        eng.build_graph(nodes=nodes, edges=edges)
        return eng

    def test_downstream_from_a1_stays_in_feeder_a(self, engine):
        nodes, edges = engine.find_downstream("A1")
        assert "A2" in nodes
        assert "A3" in nodes
        # must not bleed into feeder B
        assert "B1" not in nodes
        assert "B2" not in nodes
        assert "B3" not in nodes

    def test_downstream_from_b1_stays_in_feeder_b(self, engine):
        nodes, edges = engine.find_downstream("B1")
        assert "B2" in nodes
        assert "B3" in nodes
        assert "A1" not in nodes
        assert "A2" not in nodes
        assert "A3" not in nodes

    def test_upstream_from_a3_finds_only_feeder_a_source(self, engine):
        nodes, _ = engine.find_upstream("A3")
        assert "A2" in nodes
        assert "A1" in nodes
        # SRC_B must not appear
        assert "B1" not in nodes
        assert "SRC_B" not in nodes


class TestMultiSourceNearestSourceSelection:
    """Source selection uses nearest-source (multi-source Dijkstra), not highest-voltage.

    When a feeder has a DG unit (LOW_SRC at 12.47 kV) closer to a load node than
    the transmission source (HIGH_SRC at 115 kV), the load node is anchored to
    LOW_SRC because Dijkstra assigns it to the nearest EnergySource.  Upstream
    traversal from N2 therefore terminates at LOW_SRC rather than continuing to
    HIGH_SRC / XFMR.  This is a known limitation of the nearest-source algorithm.

    Topology:  HIGH_SRC (115 kV) → XFMR → LOW_SRC (12.47 kV) → N1 → N2
    """

    @pytest.fixture
    def engine(self):
        nodes = [
            _energy_source_node("HIGH_SRC", kv=115.0),
            _node("XFMR", kv=115.0),
            _energy_source_node("LOW_SRC", kv=12.47),
            _node("N1", kv=12.47),
            _node("N2", kv=12.47),
        ]
        edges = [
            _edge("HIGH_SRC", "XFMR"),
            _edge("XFMR", "LOW_SRC"),
            _edge("LOW_SRC", "N1"),
            _edge("N1", "N2"),
        ]
        eng = TopologyEngine()
        eng.build_graph(nodes=nodes, edges=edges)
        return eng

    def test_connected_source_for_n1_is_nearest(self, engine):
        # N1 is 1 hop from LOW_SRC and 3 hops from HIGH_SRC → nearest wins
        source_id = engine._find_topologically_connected_energy_source("N1")
        assert source_id == "LOW_SRC"

    def test_downstream_from_xfmr_includes_n1_n2(self, engine):
        nodes, _ = engine.find_downstream("XFMR")
        assert "N1" in nodes
        assert "N2" in nodes

    def test_upstream_from_n2_reaches_low_src(self, engine):
        # Upstream anchored to LOW_SRC: traversal stops at depth 0 (LOW_SRC)
        nodes, _ = engine.find_upstream("N2")
        assert "N1" in nodes
        assert "LOW_SRC" in nodes


class TestNoEnergySource:
    """Engine must not crash when no EnergySource nodes exist."""

    @pytest.fixture
    def engine(self):
        nodes = [_node("X1"), _node("X2"), _node("X3")]
        edges = [_edge("X1", "X2"), _edge("X2", "X3")]
        eng = TopologyEngine()
        eng.build_graph(nodes=nodes, edges=edges)
        return eng

    def test_find_connected_source_returns_none(self, engine):
        assert engine._find_topologically_connected_energy_source("X1") is None

    def test_downstream_still_works(self, engine):
        nodes, _ = engine.find_downstream("X1")
        assert "X2" in nodes
        assert "X3" in nodes
