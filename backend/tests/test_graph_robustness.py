import pytest
from src.grid.networkx_engine import NetworkXEngine
from src.grid.graph_node import GraphNode

def test_robust_downstream_traversal():
    """Verify that downstream traversal respects logical flow depth."""
    engine = NetworkXEngine()
    
    # 1. Setup nodes
    # S (Source) -> A -> B (Reversed edge B->A) -> C
    #             \-> D (Stitch loop with E)
    nodes = [
        GraphNode(id="S", type="Substation", name="Source"),
        GraphNode(id="A", type="Bus", name="A", latitude=34.0, longitude=-118.0),
        GraphNode(id="B", type="Bus", name="B"),
        GraphNode(id="C", type="Bus", name="C"),
        GraphNode(id="D", type="Bus", name="D", latitude=34.2, longitude=-118.2),
        GraphNode(id="E", type="Bus", name="E", latitude=34.2, longitude=-118.2), # Coincident with D
    ]
    
    # 2. Setup edges
    # We consciously create some edges in the "wrong" directed sense to test the robustness
    edges = [
        {"edge_id": "e1", "from_node_id": "S", "to_node_id": "A"},
        {"edge_id": "e2", "from_node_id": "B", "to_node_id": "A"}, # Directed WRONG: B is logically downstream of A
        {"edge_id": "e3", "from_node_id": "B", "to_node_id": "C"},
        {"edge_id": "e4", "from_node_id": "A", "to_node_id": "D"},
    ]
    
    # undirected connectivity: S-A, A-B, B-C, A-D, D-E
    # Depths from S: S=0, A=1, B=2, D=2, C=3, E=2
    
    engine.build_graph(nodes, edges)
    
    # Verify pre-calculated depths
    assert engine.flow_depth["S"] == 0
    assert engine.flow_depth["A"] == 1
    assert engine.flow_depth["B"] == 2
    assert engine.flow_depth["D"] == 2
    assert engine.flow_depth["E"] == 2
    assert engine.flow_depth["C"] == 3
    
    # Test 1: find_downstream from B
    # Forward edges from B: [e3 -> C, e2 -> A]
    # Without robustness: would find A and S.
    # With robustness: d(A)=1 < d(B)=2, so A is skipped. Only C is found.
    nodes_found, edges_found = engine.find_downstream("B")
    assert "C" in nodes_found
    assert "A" not in nodes_found
    assert "S" not in nodes_found
    assert "e3" in edges_found
    assert "e2" not in edges_found
    
    # Test 2: find_upstream from B
    # find_upstream reverses graph: [A -> B, C -> B]
    # At B (d=2): 
    #   Follow A (d=1): 1 <= 2? Yes -> A found.
    #   A (d=1) -> S (d=0): 0 <= 1? Yes -> S found.
    #   Follow C (d=3): 3 <= 2? No -> C skipped.
    nodes_found, _ = engine.find_upstream("B")
    assert "A" in nodes_found
    assert "S" in nodes_found
    assert "C" not in nodes_found

    # Test 3: Stitching traversal (A -> D <-> E)
    # find_downstream from D:
    #   D (d=2) -> E (d=2): 2 >= 2? Yes.
    nodes_found, _ = engine.find_downstream("D")
    assert "E" in nodes_found
    
    # find_upstream from E:
    #   E (d=2) -> D (d=2): 2 <= 2? Yes.
    #   D (d=2) -> A (d=1) via reversed e4: 1 <= 2? Yes.
    nodes_found, _ = engine.find_upstream("E")
    assert "D" in nodes_found
    assert "A" in nodes_found
    assert "S" in nodes_found
