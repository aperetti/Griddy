import pytest
from src.analytics.map_voltage import MapVoltageUseCase
from src.grid.networkx_engine import NetworkXEngine
from src.shared.duckdb_meter_data_repository import DuckDBMeterDataRepository

def test_map_voltage_error_path():
    """Test the error path for map voltage use case when DB connection fails."""
    graph_engine = NetworkXEngine()
    # Provide an invalid path to force an exception
    db_path = "/invalid/path/to/nonexistent_db.duckdb"

    meter_repo = DuckDBMeterDataRepository(db_path, "readings")
    uc = MapVoltageUseCase(graph_engine, meter_repo)

    result = uc.execute("2020-01-01T00:00:00", "2030-01-01T00:00:00", "avg")

    assert "error" in result
    assert "IO Error" in result["error"] or "does not exist" in result["error"]
