from src.shared.dependencies import graph_engine, ensure_graph_built
from src.analytics.calculate_voltage import CalculateVoltageDistributionUseCase
from src.shared.database_setup import DB_PATH, PARQUET_DIR
import os
import json

ensure_graph_built()
uc = CalculateVoltageDistributionUseCase(graph_engine, DB_PATH, PARQUET_DIR)

# Test with a small range (1 day) to verify hourly granularity
node_ids = ["E93A6F17-44FE-4E0A-B640-20C876F940B9"]
start = "2026-04-01T00:00:00Z"
end = "2026-04-01T23:59:59Z"

print(f"Testing node {node_ids} from {start} to {end}")
result = uc.execute(node_ids, start, end)

print(f"Distribution points: {len(result.get('distribution', []))}")
print(f"Scatter points: {len(result.get('scatter', []))}")
print(f"Timeseries points: {len(result.get('timeseries', []))}")

if len(result.get('timeseries', [])) > 0:
    print(f"First timeseries point date: {result['timeseries'][0]['date']}")
    # Hourly should match ISO with T and HH
    if 'T' in result['timeseries'][0]['date']:
        print("SUCCESS: Hourly granularity detected for short range.")
    else:
        print("FAILURE: Expected hourly granularity (ISO with T) but got daily.")

if len(result.get('scatter', [])) > 0:
    print("SUCCESS: Scatter data populated with bucketed join.")
else:
    print("WARNING: Scatter data still empty (might be no consumption for this node).")
