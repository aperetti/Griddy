from src.shared.dependencies import graph_engine, ensure_graph_built
from src.analytics.calculate_consumption import CalculateAggregateConsumptionUseCase
from src.shared.database_setup import DB_PATH, PARQUET_DIR
import os

ensure_graph_built()
uc = CalculateAggregateConsumptionUseCase(graph_engine, DB_PATH, PARQUET_DIR)

try:
    print(uc.estimate(["DAF456F9-2AE7-4F27-85F2-E4533AA3DEB6"], "2026-03-02T03:16:31", "2026-04-02T02:16:31"))
except Exception as e:
    import traceback
    traceback.print_exc()
