import pytest
import os
import pandas as pd
import duckdb
from unittest.mock import MagicMock
import networkx as nx
from src.analytics.map_edge_load import MapEdgeLoadUseCase
from src.shared.meter_adapters.duckdb_adapter import DuckDBMeterDataRepository

@pytest.fixture
def mock_graph_engine():
    engine = MagicMock()
    # Create a 3-node radial graph: Substation (0) -> Transformer (1) -> Meter (2)
    G = nx.MultiDiGraph()
    G.add_edge("Substation", "Transformer", edge_id="E1", virtual=False)
    G.add_edge("Transformer", "Meter", edge_id="E2", virtual=False)
    
    engine.graph = G
    engine.get_all_edges.return_value = [
        {"from_node_id": "Substation", "to_node_id": "Transformer", "edge_id": "E1"},
        {"from_node_id": "Transformer", "to_node_id": "Meter", "edge_id": "E2"}
    ]
    
    def find_downstream(node_id, max_depth=None):
        if node_id == "Substation":
            return ["Transformer", "Meter"], ["E1", "E2"]
        if node_id == "Transformer":
            return ["Meter"], ["E2"]
        if node_id == "Meter":
            return [], []
        return [], []
    
    engine.find_downstream.side_effect = find_downstream
    return engine

@pytest.fixture
def temp_parquet_dir(tmp_path):
    parquet_dir = tmp_path / "readings"
    parquet_dir.mkdir()
    
    # Create synthetic load data for TWO months
    # Jan 2026
    jan_data = [
        {"node_id": "Meter", "timestamp": pd.to_datetime("2026-01-15T12:00:00"), "kwh_dlv": 10.0},
        {"node_id": "Transformer", "timestamp": pd.to_datetime("2026-01-15T12:00:00"), "kwh_dlv": 2.0},
    ]
    pd.DataFrame(jan_data).to_parquet(parquet_dir / "readings_unified_2026_01.parquet")

    # April 2026 (the actual test month)
    april_data = [
        {"node_id": "Meter", "timestamp": pd.to_datetime("2026-04-01T12:00:00"), "kwh_dlv": 10.0},
        {"node_id": "Transformer", "timestamp": pd.to_datetime("2026-04-01T12:00:00"), "kwh_dlv": 2.0},
        {"node_id": "Substation", "timestamp": pd.to_datetime("2026-04-01T12:00:00"), "kwh_dlv": 0.0}
    ]
    pd.DataFrame(april_data).to_parquet(parquet_dir / "readings_unified_2026_04.parquet")
    
    return str(parquet_dir)

def test_topological_load_aggregation(mock_graph_engine, temp_parquet_dir, tmp_path):
    db_path = str(tmp_path / "test.duckdb")
    # Create the DB file so it can be opened read-only
    with duckdb.connect(db_path) as conn:
        conn.execute("SELECT 1")
        
    meter_repo = DuckDBMeterDataRepository(db_path, temp_parquet_dir)
    uc = MapEdgeLoadUseCase(mock_graph_engine, meter_repo)
    
    # Test file pruning logic
    files = meter_repo._get_parquet_range_files("2026-04-01T00:00:00", "2026-04-01T23:59:59")
    assert len(files) == 1
    assert "2026_04" in files[0]
    assert "2026_01" not in files[0]

    # Test multi-month pruning
    multi_files = meter_repo._get_parquet_range_files("2026-01-01T00:00:00", "2026-04-15T23:59:59")
    assert len(multi_files) == 2
    
    start_time = "2026-04-01T00:00:00"
    end_time = "2026-04-02T00:00:00"
    
    result = uc.execute(start_time, end_time, "mean")
    
    assert "error" not in result
    assert result["aggregated"] is True
    
    edge_loads = result["edge_loads"]
    
    # E2 (Transformer -> Meter) should have the load of Meter = 10.0
    assert edge_loads["E2"] == 10.0
    
    # E1 (Substation -> Transformer) should have load of Transformer(2.0) + Meter(10.0) = 12.0
    assert edge_loads["E1"] == 12.0
    
    assert result["edge_count"] == 2

def test_topological_load_aggregation_no_data(mock_graph_engine, tmp_path):
    # Test with empty directory
    empty_dir = tmp_path / "empty"
    empty_dir.mkdir()
    db_path = str(tmp_path / "test.duckdb")
    # Create the DB file
    with duckdb.connect(db_path) as conn:
        conn.execute("SELECT 1")
    
    meter_repo = DuckDBMeterDataRepository(db_path, str(empty_dir))
    uc = MapEdgeLoadUseCase(mock_graph_engine, meter_repo)
    result = uc.execute("2026-01-01", "2026-01-02", "mean")
    
    assert "error" in result
    assert "No load data available" in result["error"]
