import pytest
import time
import os
import duckdb
from src.shared.meter_adapters.duckdb_adapter import DuckDBMeterDataRepository
from src.shared.database_setup import DB_PATH, PARQUET_DIR

@pytest.mark.performance
def test_duckdb_parquet_pushdown_performance():
    """
    Verify that DuckDB correctly uses Parquet pushdown for large datasets.
    We expect sub-second performance even for large node sets if pushdown is active.
    """
    repo = DuckDBMeterDataRepository(DB_PATH, PARQUET_DIR)
    
    # 1. Gather a sample of real node IDs from the Parquet files
    with duckdb.connect() as conn:
        files = repo._get_parquet_range_files("2026-04-01T00:00:00", "2026-04-30T00:00:00")
        if not files:
            pytest.skip("No Parquet files found for testing.")
        
        sample_ids = conn.execute(f"SELECT DISTINCT node_id FROM read_parquet('{files[0]}') LIMIT 100").fetchall()
        node_ids = [r[0] for r in sample_ids]

    # 2. Test Execution Time
    start_time = "2026-04-01T00:00:00Z"
    end_time = "2026-04-07T00:00:00Z"
    
    print(f"\nBenchmarking {len(node_ids)} nodes over 1 week...")
    
    t0 = time.perf_counter()
    res = repo.get_aggregate_consumption(node_ids, {}, start_time, end_time)
    duration = time.perf_counter() - t0
    
    print(f"Query returned {len(res)} rows in {duration:.4f}s")
    
    # Assertions
    assert len(res) > 0, "Query should return data for existing nodes."
    assert duration < 1.0, f"Query took too long ({duration:.2f}s). Pushdown might be failing."

@pytest.mark.performance
def test_voltage_distribution_performance():
    """Verify that complex multi-query analytics complete within budget."""
    repo = DuckDBMeterDataRepository(DB_PATH, PARQUET_DIR)
    
    with duckdb.connect() as conn:
        files = repo._get_parquet_range_files("2026-04-01T00:00:00", "2026-04-30T00:00:00")
        if not files:
            pytest.skip("No Parquet files found for testing.")
        sample_ids = conn.execute(f"SELECT DISTINCT node_id FROM read_parquet('{files[0]}') LIMIT 50").fetchall()
        node_ids = [r[0] for r in sample_ids]

    t0 = time.perf_counter()
    res = repo.get_voltage_distribution(node_ids, "2026-04-01T00:00:00Z", "2026-04-02T00:00:00Z")
    duration = time.perf_counter() - t0
    
    print(f"Voltage distribution for {len(node_ids)} nodes took {duration:.4f}s")
    
    assert len(res["distribution"]) > 0
    assert duration < 2.0, f"Voltage distribution too slow ({duration:.2f}s)"
