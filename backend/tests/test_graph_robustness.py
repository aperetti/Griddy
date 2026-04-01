import pytest
from src.grid.topology_engine import TopologyEngine
from src.grid.graph_node import GraphNode


def _make_engine(nodes, edges):
    engine = TopologyEngine()
    engine.build_graph(nodes, edges)
    return engine


def test_flow_depth_calculated_from_source():
    """Flow depth is correct for a simple chain: S -> A -> B -> C, with A -> D branching."""
    nodes = [
        GraphNode(id="S", type="Substation", name="Source"),
        GraphNode(id="A", type="Bus", name="A", latitude=34.0, longitude=-118.0),
        GraphNode(id="B", type="Bus", name="B"),
        GraphNode(id="C", type="Bus", name="C"),
        GraphNode(id="D", type="Bus", name="D", latitude=34.2, longitude=-118.2),
        GraphNode(id="E", type="Bus", name="E", latitude=34.2, longitude=-118.2),  # Coincident with D
    ]
    edges = [
        {"edge_id": "e1", "from_node_id": "S", "to_node_id": "A"},
        {"edge_id": "e2", "from_node_id": "B", "to_node_id": "A"},   # mis-oriented: B logically downstream of A
        {"edge_id": "e3", "from_node_id": "B", "to_node_id": "C"},
        {"edge_id": "e4", "from_node_id": "A", "to_node_id": "D"},
    ]
    engine = _make_engine(nodes, edges)

    # S=0, A=1, B=2 (via undirected), D=2, C=3
    # E is stitch peer of D (same lat/lon) → same depth as D = 2
    assert engine.flow_depth["S"] == 0
    assert engine.flow_depth["A"] == 1
    assert engine.flow_depth["B"] == 2
    assert engine.flow_depth["D"] == 2
    assert engine.flow_depth["E"] == 2  # zero-cost stitch
    assert engine.flow_depth["C"] == 3


def test_downstream_does_not_traverse_upstream():
    """Downstream BFS skips nodes closer to the source (mis-oriented edges)."""
    nodes = [
        GraphNode(id="S", type="Substation", name="Source"),
        GraphNode(id="A", type="Bus", name="A"),
        GraphNode(id="B", type="Bus", name="B"),
        GraphNode(id="C", type="Bus", name="C"),
    ]
    edges = [
        {"edge_id": "e1", "from_node_id": "S", "to_node_id": "A"},
        {"edge_id": "e2", "from_node_id": "B", "to_node_id": "A"},  # mis-oriented
        {"edge_id": "e3", "from_node_id": "B", "to_node_id": "C"},
    ]
    engine = _make_engine(nodes, edges)

    nodes_found, edges_found = engine.find_downstream("B")
    assert "C" in nodes_found
    assert "A" not in nodes_found
    assert "S" not in nodes_found
    assert "e3" in edges_found
    assert "e2" not in edges_found


def test_upstream_does_not_traverse_downstream():
    """Upstream BFS skips nodes farther from the source."""
    nodes = [
        GraphNode(id="S", type="Substation", name="Source"),
        GraphNode(id="A", type="Bus", name="A"),
        GraphNode(id="B", type="Bus", name="B"),
        GraphNode(id="C", type="Bus", name="C"),
    ]
    edges = [
        {"edge_id": "e1", "from_node_id": "S", "to_node_id": "A"},
        {"edge_id": "e2", "from_node_id": "B", "to_node_id": "A"},  # mis-oriented
        {"edge_id": "e3", "from_node_id": "B", "to_node_id": "C"},
    ]
    engine = _make_engine(nodes, edges)

    nodes_found, _ = engine.find_upstream("B")
    assert "A" in nodes_found
    assert "S" in nodes_found
    assert "C" not in nodes_found


def test_stitch_nodes_traversed_downstream():
    """Coincident nodes (same lat/lon) are always reachable via zero-cost stitch."""
    nodes = [
        GraphNode(id="S", type="Substation", name="Source"),
        GraphNode(id="A", type="Bus", name="A"),
        GraphNode(id="D", type="Bus", name="D", latitude=34.2, longitude=-118.2),
        GraphNode(id="E", type="Bus", name="E", latitude=34.2, longitude=-118.2),
    ]
    edges = [
        {"edge_id": "e1", "from_node_id": "S", "to_node_id": "A"},
        {"edge_id": "e4", "from_node_id": "A", "to_node_id": "D"},
    ]
    engine = _make_engine(nodes, edges)

    nodes_found, _ = engine.find_downstream("D")
    assert "E" in nodes_found


def test_stitch_nodes_traversed_upstream():
    """Stitch peer's upstream path resolves correctly."""
    nodes = [
        GraphNode(id="S", type="Substation", name="Source"),
        GraphNode(id="A", type="Bus", name="A"),
        GraphNode(id="D", type="Bus", name="D", latitude=34.2, longitude=-118.2),
        GraphNode(id="E", type="Bus", name="E", latitude=34.2, longitude=-118.2),
    ]
    edges = [
        {"edge_id": "e1", "from_node_id": "S", "to_node_id": "A"},
        {"edge_id": "e4", "from_node_id": "A", "to_node_id": "D"},
    ]
    engine = _make_engine(nodes, edges)

    nodes_found, _ = engine.find_upstream("E")
    assert "D" in nodes_found
    assert "A" in nodes_found
    assert "S" in nodes_found


def test_open_switch_blocks_traversal():
    """Edges marked is_open=True are excluded from the graph."""
    nodes = [
        GraphNode(id="S", type="Substation", name="Source"),
        GraphNode(id="A", type="Bus", name="A"),
        GraphNode(id="B", type="Bus", name="B"),
    ]
    edges = [
        {"edge_id": "e1", "from_node_id": "S", "to_node_id": "A"},
        {"edge_id": "e2", "from_node_id": "A", "to_node_id": "B", "is_open": True},
    ]
    engine = _make_engine(nodes, edges)

    nodes_found, _ = engine.find_downstream("A")
    assert "B" not in nodes_found


def test_no_source_falls_back_to_directed():
    """When no Substation/EnergySource exists, directed edges are used as fallback."""
    nodes = [
        GraphNode(id="X", type="Bus", name="X"),
        GraphNode(id="Y", type="Bus", name="Y"),
        GraphNode(id="Z", type="Bus", name="Z"),
    ]
    edges = [
        {"edge_id": "f1", "from_node_id": "X", "to_node_id": "Y"},
        {"edge_id": "f2", "from_node_id": "Y", "to_node_id": "Z"},
    ]
    engine = _make_engine(nodes, edges)

    assert engine.flow_depth == {}  # no sources found

    nodes_found, _ = engine.find_downstream("X")
    assert "Y" in nodes_found
    assert "Z" in nodes_found

    nodes_found, _ = engine.find_upstream("Z")
    assert "Y" in nodes_found
    assert "X" in nodes_found


def test_max_depth_limits_traversal():
    """max_depth caps how far BFS extends from the start node."""
    nodes = [
        GraphNode(id="S", type="Substation", name="Source"),
        GraphNode(id="A", type="Bus", name="A"),
        GraphNode(id="B", type="Bus", name="B"),
        GraphNode(id="C", type="Bus", name="C"),
    ]
    edges = [
        {"edge_id": "e1", "from_node_id": "S", "to_node_id": "A"},
        {"edge_id": "e2", "from_node_id": "A", "to_node_id": "B"},
        {"edge_id": "e3", "from_node_id": "B", "to_node_id": "C"},
    ]
    engine = _make_engine(nodes, edges)

    nodes_found, _ = engine.find_downstream("A", max_depth=1)
    assert "B" in nodes_found
    assert "C" not in nodes_found


def test_unknown_start_node_returns_empty():
    """Requesting traversal from an unknown node ID returns empty lists gracefully."""
    engine = TopologyEngine()
    nodes_found, edges_found = engine.find_downstream("nonexistent")
    assert nodes_found == []
    assert edges_found == []
