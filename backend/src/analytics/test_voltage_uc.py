import sys
import os
import json
from pathlib import Path

# Add project root to path
sys.path.append(str(Path(__file__).resolve().parents[3]))

from src.analytics.calculate_voltage import CalculateVoltageDistributionUseCase
from src.shared.database_setup import DB_PATH, PARQUET_DIR

class MockEngine:
    def find_downstream(self, node_id, max_depth=None):
        return [], []

def test_use_case():
    engine = MockEngine()
    uc = CalculateVoltageDistributionUseCase(engine, DB_PATH, PARQUET_DIR)
    
    node_id = "D3618E81-B61D-4A30-B72A-6B8645C78553"
    start = "2025-01-01T00:00:00"
    end = "2025-01-31T23:59:59"
    
    print(f"Testing node {node_id} from {start} to {end}")
    try:
        result = uc.execute([node_id], start, end)
        print("\nSUCCESS!")
        print(f"Node Count: {result['node_count']}")
        print(f"Mean Voltage: {result['mean_voltage']}")
        print(f"Distribution points: {len(result['distribution'])}")
        print(f"Scatter points: {len(result['scatter'])}")
        print(f"TimeSeries points: {len(result['timeseries'])}")
        
        if result['timeseries']:
            print(f"Sample TS: {result['timeseries'][0]}")
            
    except Exception as e:
        print(f"FAILED: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_use_case()
