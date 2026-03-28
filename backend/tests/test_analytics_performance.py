import time
import duckdb
import os
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from src.analytics.calculate_consumption import CalculateAggregateConsumptionUseCase
from src.grid.networkx_engine import NetworkXEngine

def setup_test_data(parquet_dir, num_nodes=100, readings_per_node=1000):
    os.makedirs(parquet_dir, exist_ok=True)
    
    start_time = datetime(2024, 1, 1)
    data = []
    
    # Generate weather recordings
    db_path = os.path.join(parquet_dir, "test.db")
    if os.path.exists(db_path):
        os.remove(db_path)
        
    with duckdb.connect(db_path) as conn:
        conn.execute("CREATE TABLE weather_recordings (month INTEGER, day INTEGER, hour INTEGER, temperature FLOAT)")
        # 1 year of hourly weather
        weather_data = []
        for d in range(1, 366):
            for h in range(24):
                weather_data.append((1, d, h, 20.0 + np.sin(h/24.0 * 2 * np.pi) * 5))
        conn.executemany("INSERT INTO weather_recordings VALUES (?, ?, ?, ?)", weather_data)

    # Generate readings
    node_ids = [f"node_{i}" for i in range(num_nodes)]
    total_rows = 0
    
    for node_id in node_ids:
        timestamps = [start_time + timedelta(minutes=15*i) for i in range(readings_per_node)]
        df = pd.DataFrame({
            'node_id': [node_id] * readings_per_node,
            'timestamp': timestamps,
            'kwh_dlv': np.random.rand(readings_per_node) * 10,
            'kwh_rcv': np.random.rand(readings_per_node) * 2,
            'voltage_a': 120 + np.random.randn(readings_per_node) * 2,
            'voltage_b': 120 + np.random.randn(readings_per_node) * 2,
            'voltage_c': 120 + np.random.randn(readings_per_node) * 2
        })
        df.to_parquet(os.path.join(parquet_dir, f"{node_id}.parquet"))
        total_rows += readings_per_node
        
    return node_ids, db_path, total_rows

class MockGraphEngine(NetworkXEngine):
    def get_node_phases(self, node_ids):
        return {nid: ["A", "B", "C"] for nid in node_ids}
    
    def find_downstream(self, node_id, max_depth=None):
        return [node_id], []

def test_performance():
    test_dir = "./tmp/perf_test"
    num_nodes = 50
    readings_per_node = 2000 # 100,000 total readings
    
    print(f"Setting up {num_nodes * readings_per_node} readings...")
    node_ids, db_path, total = setup_test_data(test_dir, num_nodes, readings_per_node)
    
    graph_engine = MockGraphEngine()
    use_case = CalculateAggregateConsumptionUseCase(graph_engine, db_path, test_dir)
    
    start_time = "2024-01-01T00:00:00"
    end_time = "2024-02-01T00:00:00"
    
    print("Executing consumption query...")
    t0 = time.time()
    result = use_case.execute(node_ids, start_time, end_time)
    t1 = time.time()
    
    if "error" in result:
        print(f"Error: {result['error']}")
    else:
        print(f"Success! Processed {total} readings in {t1-t0:.4f} seconds.")
        print(f"Returned {len(result['time_series'])} aggregated time points.")

if __name__ == "__main__":
    try:
        test_performance()
    finally:
        # Cleanup
        import shutil
        if os.path.exists("./tmp/perf_test"):
            shutil.rmtree("./tmp/perf_test")
