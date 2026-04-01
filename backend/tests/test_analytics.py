"""Integration tests for Graph Discovery and Analytics using DuckDB/Parquet."""
import pytest
from src.shared.duckdb_repository import DuckDBRepository
from src.grid.topology_engine import TopologyEngine as NetworkXEngine
from src.discovery.discover_downstream import DiscoverDownstreamUseCase
from src.analytics.calculate_voltage import CalculateVoltageDistributionUseCase
from src.analytics.phase_balancing import PhaseBalancingUseCase
from src.shared.database_setup import DB_PATH, PARQUET_DIR

@pytest.fixture
def repo():
    return DuckDBRepository(DB_PATH)

@pytest.fixture
def graph_engine(repo):
    engine = NetworkXEngine()
    
    # Normally we'd fetch nodes too, but edges construct the graph
    edges = repo.get_all_edges()
    engine.build_graph(edges=edges)
    return engine

def test_downstream_discovery(graph_engine):
    """Test discovering meters downstream of a transformer."""
    uc = DiscoverDownstreamUseCase(graph_engine)
    
    # From our mock data, TX-A should feed M-1 and M-2
    downstream_nodes, downstream_edges = uc.execute("TX-A")
    assert "M-1" in downstream_nodes
    assert "M-2" in downstream_nodes
    assert len(downstream_nodes) == 2

def test_voltage_distribution(graph_engine):
    """Test voltage distribution across a transformer."""
    uc = CalculateVoltageDistributionUseCase(graph_engine, DB_PATH, parquet_dir=PARQUET_DIR)
    
    # Query TX-B (feeds M-3 and M-4)
    # Using a wide time range to catch our mock data
    result = uc.execute("TX-B", "2020-01-01T00:00:00", "2030-01-01T00:00:00")
    
    assert "error" not in result
    assert result["node_count"] == 2
    assert len(result["distribution"]) > 0

def test_phase_balancing(graph_engine):
    """Test phase balancing across the main substation."""
    uc = PhaseBalancingUseCase(graph_engine, DB_PATH, parquet_dir=PARQUET_DIR)
    
    # Query SUB-1 (feeds everything)
    result = uc.execute("SUB-1", "2020-01-01T00:00:00", "2030-01-01T00:00:00")
    
    assert "error" not in result
    assert result["node_count"] == 6 # TX-A, TX-B, M-1, M-2, M-3, M-4
    assert result["median_current_a"] > 0
    assert result["median_current_b"] > 0
    assert result["median_current_c"] > 0
    assert result["imbalance_delta"] >= 0

def test_phase_balancing_empty_results(graph_engine):
    """Test phase balancing logic when there are no results (e.g. outside available data)."""
    uc = PhaseBalancingUseCase(graph_engine, DB_PATH, parquet_dir=PARQUET_DIR)

    # Query with a time range far in the future
    result = uc.execute("SUB-1", "2050-01-01T00:00:00", "2060-01-01T00:00:00")

    assert "error" not in result
    assert result["median_current_a"] == 0.0
    assert result["median_current_b"] == 0.0
    assert result["median_current_c"] == 0.0
    assert result["total_kwh_delivered"] == 0.0
    assert result["imbalance_delta"] == 0.0
    assert result["peak_kwh_time"] is None
    assert result["peak_kwh"] == 0.0
    assert result["peak_current_a"] == 0.0
    assert result["peak_current_b"] == 0.0
    assert result["peak_current_c"] == 0.0
