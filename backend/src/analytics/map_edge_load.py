"""Use Case: Map Edge Load View."""
from typing import Dict, Any, Optional
import duckdb
from src.shared.graph_engine import GraphEngine

class MapEdgeLoadUseCase:
    """Calculates edge load aggregations (min, max, median, mean) for map visualization."""
    
    def __init__(self, graph_engine: GraphEngine, db_path: str):
        self.graph_engine = graph_engine
        self.db_path = db_path
        
    def estimate(self, start_time: str, end_time: str, agg: str, start_node_id: Optional[str] = None) -> Dict[str, Any]:
        """Returns the estimated number of rows to be processed for the edge load map."""
        # Simple estimate based on the edge_load_averages table
        query_params = [start_time, end_time]
        
        prefetch_query = """
            SELECT COUNT(*) as estimated_rows
            FROM edge_load_averages
            WHERE timestamp >= CAST(? AS TIMESTAMP)
              AND timestamp <= CAST(? AS TIMESTAMP)
        """
        
        try:
            with duckdb.connect(self.db_path, read_only=True) as conn:
                prefetch_results = conn.execute(prefetch_query, query_params).fetchone()
            
            return {
                "estimated_rows": prefetch_results[0] if prefetch_results else 0,
            }
        except Exception as e:
            # Fallback if table doesn't exist yet
            return {"estimated_rows": 0, "error": str(e)}

    def execute(self, start_time: str, end_time: str, agg: str, start_node_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Executes the edge load aggregation query.
        
        Args:
            start_time: ISO timestamp string.
            end_time: ISO timestamp string.
            agg: The aggregation type ('min', 'max', 'median', 'mean')
            start_node_id: Optional device to start from. (Not used for full map yet)
            
        Returns:
            Dictionary with edge_loads mapping.
        """
        query_params = [start_time, end_time]

        agg_func = "AVG"
        if agg == "min":
            agg_func = "MIN"
        elif agg == "max":
            agg_func = "MAX"
        elif agg == "median":
            agg_func = "MEDIAN"
            
        edge_load_query = f"""
            SELECT 
                edge_id, 
                {agg_func}(load_value) as load
            FROM edge_load_averages
            WHERE timestamp >= CAST(? AS TIMESTAMP)
              AND timestamp <= CAST(? AS TIMESTAMP)
            GROUP BY edge_id
        """
        
        try:
            with duckdb.connect(self.db_path, read_only=True) as conn:
                results = conn.execute(edge_load_query, query_params).fetchall()
                
            edge_loads = {row[0]: float(row[1]) for row in results if row[1] is not None}
                
            return {
                "edge_count": len(edge_loads),
                "edge_loads": edge_loads,
                "agg": agg
            }
        except Exception as e:
             return {"error": str(e)}
