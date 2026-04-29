import time
import os
import shutil
import pytest
import duckdb
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from src.shared.meter_adapters.duckdb_adapter import DuckDBMeterDataRepository

def test_large_node_list_performance():
    """
    Verify that DuckDBMeterDataRepository handles 50,000+ node IDs efficiently
    using the SQL IN list optimization.
    """
    test_dir = "./tmp/perf_test_large"
    if os.path.exists(test_dir):
        shutil.rmtree(test_dir)
    os.makedirs(test_dir, exist_ok=True)
    db_path = os.path.join(test_dir, "test.db")
    
    # 1. Create a single parquet file with some data
    # Filename must match the pattern readings_YYYY_MM.parquet
    parquet_path = os.path.join(test_dir, "readings_2026_04.parquet")
    num_real_nodes = 100
    readings_per_node = 10
    
    start_time = datetime(2026, 4, 1)
    data = []
    for i in range(num_real_nodes):
        node_id = f"REAL_NODE_{i}"
        for j in range(readings_per_node):
            data.append({
                'node_id': node_id,
                'timestamp': start_time + timedelta(minutes=15*j),
                'kwh_dlv': 1.0,
                'kwh_rcv': 0.0,
                'voltage_a': 120.0,
                'voltage_b': 120.0,
                'voltage_c': 120.0,
                'current_a': 1.0,
                'current_b': 1.0,
                'current_c': 1.0
            })
    pd.DataFrame(data).to_parquet(parquet_path)

    # 2. Create weather table
    with duckdb.connect(db_path) as conn:
        conn.execute("CREATE TABLE weather_recordings (month INTEGER, day INTEGER, hour INTEGER, temperature FLOAT)")

    try:
        repo = DuckDBMeterDataRepository(db_path, test_dir)
        
        # 3. Generate 50,000 dummy node IDs + 100 real ones
        large_node_list = [f"DUMMY_NODE_{i}" for i in range(50000)]
        large_node_list.extend([f"REAL_NODE_{i}" for i in range(num_real_nodes)])
        
        start_iso = "2026-04-01T00:00:00"
        end_iso = "2026-04-01T23:59:59" # 1 day, as per user requirement
        
        # 4. Measure performance of estimate_aggregate_consumption
        t0 = time.perf_counter()
        est = repo.estimate_aggregate_consumption(large_node_list, start_iso, end_iso)
        t_est = time.perf_counter() - t0
        
        print(f"Estimation took {t_est:.4f}s")
        assert est["estimated_rows"] == num_real_nodes * readings_per_node
        assert t_est < 1.0  # Should be sub-second
        
        # 5. Measure performance of get_aggregate_consumption
        t1 = time.perf_counter()
        data_res = repo.get_aggregate_consumption(large_node_list, {}, start_iso, end_iso)
        t_data = time.perf_counter() - t1
        
        print(f"Data fetch took {t_data:.4f}s")
        assert len(data_res) == readings_per_node
        assert t_data < 1.0  # Should be sub-second
        
        # 6. Measure performance of get_voltage_distribution
        t2 = time.perf_counter()
        volt_res = repo.get_voltage_distribution(large_node_list, start_iso, end_iso)
        t_volt = time.perf_counter() - t2
        
        print(f"Voltage distribution took {t_volt:.4f}s")
        assert "distribution" in volt_res
        assert t_volt < 3.0  # More complex: percentiles + scatter + stability sub-queries
        
        print("Performance test PASSED!")
        
    finally:
        # Give DuckDB a moment to release handles if needed, or just ignore cleanup errors on Windows
        import gc
        gc.collect() # Try to trigger __del__ on local connections
        if os.path.exists(test_dir):
            try:
                shutil.rmtree(test_dir)
            except PermissionError:
                print(f"Warning: Could not cleanup {test_dir} due to PermissionError (DuckDB handle still open)")

if __name__ == "__main__":
    test_large_node_list_performance()
