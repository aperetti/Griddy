"""Tests for phase propagation correctness, NameError fix in PhaseBalancingUseCase, and BFS/weather caching."""
import pytest
from unittest.mock import MagicMock, patch, call
from src.grid.topology_engine import TopologyEngine
from src.grid.graph_node import GraphNode
from src.analytics.calculate_consumption import CalculateAggregateConsumptionUseCase
from src.analytics.phase_balancing import PhaseBalancingUseCase


# ── Helpers ───────────────────────────────────────────────────────────────────

def _node(nid: str, phases: list = None, kv: float = 4.16) -> GraphNode:
    return GraphNode(
        id=nid,
        type="Bus",
        name=nid,
        base_voltage_kv=kv,
        phases=phases or [],
        attached_equipment=[{"type": "EnergySource", "name": f"src_{nid}"}] if kv > 10 else [],
    )


def _edge(src: str, dst: str, phases: list = None, eid: str = None) -> dict:
    e = {
        "from_node_id": src,
        "to_node_id": dst,
        "edge_id": eid or f"{src}__{dst}",
    }
    if phases is not None:
        e["phases"] = phases
    return e


def _build_engine(nodes, edges):
    eng = TopologyEngine()
    eng.build_graph(nodes=nodes, edges=edges)
    return eng


def _mock_meter_repo(results=None):
    repo = MagicMock()
    repo.get_aggregate_consumption.return_value = results or []
    repo.estimate_aggregate_consumption.return_value = {"estimated_rows": 0}
    repo.get_phase_balancing.return_value = {"results": []}
    return repo


# ── Phase propagation correctness ─────────────────────────────────────────────

class TestEdgePhasePropagation:
    """Edge phase takes priority over inheriting the parent's full profile."""

    def _run(self, src_phases, edge_phases, child_phases):
        """Build a 2-node graph and return the child's computed phase profile."""
        import src.shared.dependencies as deps
        nodes = [
            _node("SRC", phases=src_phases, kv=12.47),
            _node("CHILD", phases=child_phases),
        ]
        edges = [_edge("SRC", "CHILD", phases=edge_phases)]
        engine = _build_engine(nodes, edges)

        # Patch module-level dicts in dependencies (where the local imports resolve)
        orig_names = deps._node_to_equipment_names
        orig_mrids = deps._node_to_equipment_mrids
        orig_eq_node = deps._equipment_to_node
        try:
            deps._node_to_equipment_names = {"SRC": ["SRC_eq"], "CHILD": ["CHILD_eq"]}
            deps._node_to_equipment_mrids = {}
            deps._equipment_to_node = {}

            repo = _mock_meter_repo()
            uc = CalculateAggregateConsumptionUseCase(engine, repo)
            uc.execute(["SRC"], "2024-01-01T00:00:00", "2024-01-31T23:00:00")
        finally:
            deps._node_to_equipment_names = orig_names
            deps._node_to_equipment_mrids = orig_mrids
            deps._equipment_to_node = orig_eq_node

        captured_weights = repo.get_aggregate_consumption.call_args
        if captured_weights is None:
            return None
        _, equipment_weights, _, _ = captured_weights.args
        return equipment_weights.get("CHILD_eq")

    def test_single_phase_edge_overrides_abc_parent(self):
        """Child with no phases gets phase A from the connecting edge, not ABC from parent."""
        profile = self._run(
            src_phases=["A", "B", "C"],
            edge_phases=["A"],
            child_phases=[],
        )
        assert profile is not None
        assert profile["A"] == pytest.approx(1.0)
        assert profile["B"] == pytest.approx(0.0)
        assert profile["C"] == pytest.approx(0.0)

    def test_two_phase_edge_splits_equally(self):
        """Child connected through an AB edge gets 50/50 split."""
        profile = self._run(
            src_phases=["A", "B", "C"],
            edge_phases=["A", "B"],
            child_phases=[],
        )
        assert profile is not None
        assert profile["A"] == pytest.approx(0.5)
        assert profile["B"] == pytest.approx(0.5)
        assert profile["C"] == pytest.approx(0.0)

    def test_parent_fallback_when_edge_has_no_phases(self):
        """When the edge carries no phase info, child inherits parent's profile."""
        profile = self._run(
            src_phases=["A"],
            edge_phases=[],
            child_phases=[],
        )
        assert profile is not None
        # Parent is single-phase A, so child should also be A
        assert profile["A"] == pytest.approx(1.0)

    def test_child_own_phases_take_priority(self):
        """Child node with explicit phases B ignores the edge's phase A."""
        profile = self._run(
            src_phases=["A", "B", "C"],
            edge_phases=["A"],
            child_phases=["B"],
        )
        assert profile is not None
        assert profile["B"] == pytest.approx(1.0)
        assert profile["A"] == pytest.approx(0.0)


# ── PhaseBalancingUseCase NameError fix ───────────────────────────────────────

class TestPhaseBalancingNameError:
    """Regression: nodes_to_query NameError when results list is empty or non-empty."""

    def _make_uc(self, downstream_nodes=None, downstream_edges=None, results=None):
        engine = MagicMock()
        engine.find_downstream.return_value = (downstream_nodes or [], downstream_edges or [])
        repo = MagicMock()
        repo.get_phase_balancing.return_value = {"results": results or []}
        with patch("src.analytics.phase_balancing.resolve_to_storage_keys", return_value=[]):
            uc = PhaseBalancingUseCase(engine, repo)
        return uc

    def test_no_results_returns_dict_without_nameerror(self):
        import src.shared.dependencies as deps
        engine = MagicMock()
        engine.find_downstream.return_value = ([], [])
        repo = MagicMock()
        repo.get_phase_balancing.return_value = {"results": []}
        uc = PhaseBalancingUseCase(engine, repo)

        orig = deps.resolve_to_storage_keys
        try:
            deps.resolve_to_storage_keys = lambda nodes: []
            result = uc.execute("NODE_1", "2024-01-01T00:00:00", "2024-01-31T23:00:00")
        finally:
            deps.resolve_to_storage_keys = orig

        assert "downstream_node_ids" in result
        assert isinstance(result["downstream_node_ids"], list)
        assert "NODE_1" in result["downstream_node_ids"]
        assert "node_count" in result

    def test_with_results_returns_dict_without_nameerror(self):
        import src.shared.dependencies as deps
        sample_results = [
            {"timestamp": "2024-01-01T00:00:00", "current_a": 10.0, "current_b": 11.0, "current_c": 9.5, "kwh": 5.0},
        ]
        engine = MagicMock()
        engine.find_downstream.return_value = (["NODE_2"], ["EDGE_1"])
        repo = MagicMock()
        repo.get_phase_balancing.return_value = {"results": sample_results}
        uc = PhaseBalancingUseCase(engine, repo)

        orig = deps.resolve_to_storage_keys
        try:
            deps.resolve_to_storage_keys = lambda nodes: ["eq1"]
            result = uc.execute("NODE_1", "2024-01-01T00:00:00", "2024-01-31T23:00:00")
        finally:
            deps.resolve_to_storage_keys = orig

        assert "downstream_node_ids" in result
        assert "NODE_1" in result["downstream_node_ids"]
        assert result["node_count"] == 2  # start node + 1 downstream


# ── BFS caching ───────────────────────────────────────────────────────────────

class TestBFSCache:
    """find_downstream / find_upstream cache results and invalidate on build_graph."""

    @pytest.fixture
    def engine(self):
        nodes = [
            _node("A", kv=12.47, phases=["A", "B", "C"]),
            _node("B"),
            _node("C"),
        ]
        edges = [_edge("A", "B"), _edge("B", "C")]
        eng = _build_engine(nodes, edges)
        return eng

    def test_downstream_cached_after_first_call(self, engine):
        call_count = {"n": 0}
        original_bfs = engine._bfs

        def counting_bfs(*args, **kwargs):
            call_count["n"] += 1
            return original_bfs(*args, **kwargs)

        engine._bfs = counting_bfs

        result1 = engine.find_downstream("A")
        result2 = engine.find_downstream("A")

        assert call_count["n"] == 1, "BFS should only run once; second call should hit cache"
        assert set(result1[0]) == set(result2[0])

    def test_upstream_cached_after_first_call(self, engine):
        call_count = {"n": 0}
        original_bfs = engine._bfs

        def counting_bfs(*args, **kwargs):
            call_count["n"] += 1
            return original_bfs(*args, **kwargs)

        engine._bfs = counting_bfs

        engine.find_upstream("C")
        engine.find_upstream("C")

        assert call_count["n"] == 1

    def test_different_max_depth_are_separate_cache_entries(self, engine):
        call_count = {"n": 0}
        original_bfs = engine._bfs

        def counting_bfs(*args, **kwargs):
            call_count["n"] += 1
            return original_bfs(*args, **kwargs)

        engine._bfs = counting_bfs

        engine.find_downstream("A", max_depth=1)
        engine.find_downstream("A", max_depth=None)

        assert call_count["n"] == 2, "Different max_depth values must use separate cache entries"

    def test_build_graph_invalidates_cache(self, engine):
        call_count = {"n": 0}
        original_bfs = engine._bfs

        def counting_bfs(*args, **kwargs):
            call_count["n"] += 1
            return original_bfs(*args, **kwargs)

        engine.find_downstream("A")
        engine._bfs = counting_bfs

        nodes = [_node("A", kv=12.47), _node("B"), _node("C")]
        edges = [_edge("A", "B"), _edge("B", "C")]
        engine.build_graph(nodes=nodes, edges=edges)
        engine._bfs = counting_bfs  # re-patch after rebuild
        engine.find_downstream("A")

        assert call_count["n"] == 1, "After build_graph, BFS cache is cleared and must recompute"
