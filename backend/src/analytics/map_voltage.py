"""Use Case: Map Voltage View."""
from typing import Dict, Any, Optional
import duckdb
from src.shared.graph_engine import GraphEngine

def _safe_parquet_path(path: str) -> str:
    """Return a SQL-safe parquet directory path or raise ValueError."""
    if "'" in path or '"' in path:
        raise ValueError(f"PARQUET_DIR contains invalid characters: {path!r}")
    return path.replace("\\", "/")

class MapVoltageUseCase:
    """Calculates voltage aggregations (min, max, median) for map visualization."""
    
    def __init__(self, graph_engine: GraphEngine, db_path: str, parquet_dir: str = 'readings'):
        self.graph_engine = graph_engine
        self.db_path = db_path
        self.parquet_dir = parquet_dir
        
    def estimate(self, start_time: str, end_time: str, agg: str, start_node_id: Optional[str] = None) -> Dict[str, Any]:
        """Returns the estimated number of rows to be processed for the map."""
        nodes_list_filter = ""
        nodes_count = 0
        query_params = [start_time, end_time]

        if start_node_id:
            downstream_nodes, _ = self.graph_engine.find_downstream(start_node_id)
            nodes_to_query = downstream_nodes if downstream_nodes else [start_node_id]
            nodes_count = len(nodes_to_query)
            placeholders = ",".join(["?"] * nodes_count)
            nodes_list_filter = f"AND node_id IN ({placeholders})"
            query_params.extend(nodes_to_query)

        safe_dir = _safe_parquet_path(self.parquet_dir)

        prefetch_query = f"""
            SELECT COUNT(*) as estimated_rows
            FROM read_parquet('{safe_dir}/*.parquet')
            WHERE timestamp >= CAST(? AS TIMESTAMP)
              AND timestamp <= CAST(? AS TIMESTAMP)
              AND (voltage_a IS NOT NULL OR voltage_b IS NOT NULL OR voltage_c IS NOT NULL)
              {nodes_list_filter}
        """
        
        try:
            with duckdb.connect(self.db_path, read_only=True) as conn:
                prefetch_results = conn.execute(prefetch_query, query_params).fetchone()
            
            return {
                "estimated_rows": prefetch_results[0] if prefetch_results else 0,
                "node_count": nodes_count
            }
        except Exception as e:
            return {"error": str(e)}

    def execute(self, start_time: str, end_time: str, agg: str, start_node_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Executes the voltage aggregation query.
        
        Args:
            start_time: ISO timestamp string.
            end_time: ISO timestamp string.
            agg: The aggregation type ('min', 'max', 'median')
            start_node_id: Optional device to start from. If None, queries all.
            
        Returns:
            Dictionary with node_voltages mapping.
        """
        nodes_list_filter = ""
        nodes_to_query = []
        query_params = [start_time, end_time]

        if start_node_id:
            downstream_nodes, _ = self.graph_engine.find_downstream(start_node_id)
            nodes_to_query = downstream_nodes if downstream_nodes else [start_node_id]
            placeholders = ",".join(["?"] * len(nodes_to_query))
            nodes_list_filter = f"AND node_id IN ({placeholders})"
            query_params.extend(nodes_to_query)

        agg_func = "AVG"
        if agg == "min":
            agg_func = "MIN"
        elif agg == "max":
            agg_func = "MAX"
        elif agg == "median":
            # DuckDB median
            agg_func = "MEDIAN"
            
        safe_dir = _safe_parquet_path(self.parquet_dir)

        # Use parameterized queries to prevent SQL injection
        node_avg_query = f"""
            SELECT 
                node_id, 
                {agg_func}(list_avg([voltage_a, voltage_b, voltage_c])) as v,
                AVG(current_a) as ia,
                AVG(current_b) as ib,
                AVG(current_c) as ic
            FROM read_parquet('{safe_dir}/*.parquet')
            WHERE timestamp >= CAST(? AS TIMESTAMP)
              AND timestamp <= CAST(? AS TIMESTAMP)
              AND (voltage_a IS NOT NULL OR voltage_b IS NOT NULL OR voltage_c IS NOT NULL)
              {nodes_list_filter}
            GROUP BY node_id
        """
        
        prefetch_query = f"""
            SELECT COUNT(*) as estimated_rows
            FROM read_parquet('{safe_dir}/*.parquet')
            WHERE timestamp >= CAST(? AS TIMESTAMP)
              AND timestamp <= CAST(? AS TIMESTAMP)
              AND (voltage_a IS NOT NULL OR voltage_b IS NOT NULL OR voltage_c IS NOT NULL)
              {nodes_list_filter}
        """
        
        try:
            with duckdb.connect(self.db_path, read_only=True) as conn:
                prefetch_results = conn.execute(prefetch_query, query_params).fetchone()
                node_avg_results = conn.execute(node_avg_query, query_params).fetchall()
                
            node_voltages = {row[0]: float(row[1]) for row in node_avg_results if row[1] is not None}
            node_currents = {
                row[0]: {
                    "a": float(row[2]) if row[2] is not None else 0,
                    "b": float(row[3]) if row[3] is not None else 0,
                    "c": float(row[4]) if row[4] is not None else 0
                } 
                for row in node_avg_results if row[1] is not None
            }
            estimated_rows = prefetch_results[0] if prefetch_results else 0
                
            return {
                "start_node_id": start_node_id,
                "node_count": len(node_voltages),
                "node_voltages": node_voltages,
                "node_currents": node_currents,
                "estimated_rows": estimated_rows,
                "agg": agg
            }
        except Exception as e:
             return {"error": str(e)}
