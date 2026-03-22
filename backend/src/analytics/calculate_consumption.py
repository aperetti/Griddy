"""Use Case: Aggregate Consumption Analytics."""
import duckdb
from typing import Dict, Any, List
from src.shared.graph_engine import GraphEngine

class CalculateAggregateConsumptionUseCase:
    """Aggregates kwh_dlv and kwh_rcv over time for downstream meters."""
    
    def __init__(self, graph_engine: GraphEngine, db_path: str, parquet_dir: str = 'readings'):
        self.graph_engine = graph_engine
        # Handle case where db_path might be same as parquet_dir (for tests)
        self.db_path = db_path
        self.parquet_dir = parquet_dir if parquet_dir else db_path
        
    def estimate(self, start_node_ids: List[str], start_time: str, end_time: str) -> Dict[str, Any]:
        """Returns the estimated number of rows to be processed for multiple nodes."""
        all_downstream_nodes = set()
        for node_id in start_node_ids:
            nodes, _ = self.graph_engine.find_downstream(node_id)
            if nodes:
                all_downstream_nodes.update(nodes)
            else:
                all_downstream_nodes.add(node_id)
        
        nodes_to_query = list(all_downstream_nodes)
        placeholders = ",".join(["?"] * len(nodes_to_query))
        query_params = nodes_to_query + [start_time, end_time]
        
        prefetch_query = f"""
            SELECT COUNT(*) as estimated_rows
            FROM read_parquet('{self.parquet_dir}/*.parquet') r
            WHERE r.node_id IN ({placeholders})
              AND r.timestamp >= CAST(? AS TIMESTAMP)
              AND r.timestamp <= CAST(? AS TIMESTAMP)
        """
        
        try:
            with duckdb.connect(self.db_path, read_only=True) as conn:
                prefetch_results = conn.execute(prefetch_query, query_params).fetchone()
            
            return {
                "estimated_rows": prefetch_results[0] if prefetch_results else 0,
                "node_count": len(nodes_to_query)
            }
        except Exception as e:
            return {"error": str(e)}

    def execute(self, start_node_ids: List[str], start_time: str, end_time: str) -> Dict[str, Any]:
        """
        Aggregates consumption data grouped by timestamp for multiple start nodes.
        """
        all_downstream_nodes = set()
        all_downstream_edges = set()
        
        for node_id in start_node_ids:
            nodes, edges = self.graph_engine.find_downstream(node_id)
            if nodes:
                all_downstream_nodes.update(nodes)
            else:
                all_downstream_nodes.add(node_id)
            if edges:
                all_downstream_edges.update(edges)
        
        nodes_to_query = list(all_downstream_nodes)
        node_phases = self.graph_engine.get_node_phases(nodes_to_query)
        
        # Security enhancement: Use parameterized query to prevent SQL Injection
        # Build weight mapping for phase aggregation
        weight_placeholders = []
        weight_params = []
        for nid in nodes_to_query:
            p_raw = node_phases.get(nid, ["A", "B", "C"]) or ["A", "B", "C"]
            # Only count phases we display (A, B, C) for energy balance in the graph
            p_list = [p for p in p_raw if p in ("A", "B", "C")]
            
            w = {"A": 0.0, "B": 0.0, "C": 0.0}
            if p_list:
                share = 1.0 / len(p_list)
                for p in p_list:
                    w[p] = share
            else:
                # Fallback for nodes with no A/B/C phases (e.g. S1/S2 or Neutral only)
                # Split evenly to ensure total energy remains correct in the aggregate time-series.
                # 0.3333333333333333 * 3 = 1.0 (Python float precision handles this well)
                w = {"A": 1.0/3.0, "B": 1.0/3.0, "C": 1.0/3.0}
            
            weight_placeholders.append("(?, ?, ?, ?)")
            weight_params.extend([nid, w['A'], w['B'], w['C']])

        values_clause = ",".join(weight_placeholders)
        # Combine weight params with the time params
        query_params = weight_params + [start_time, end_time]
        
        query = f"""
            WITH phase_weights(node_id, wa, wb, wc) AS (
                VALUES {values_clause}
            )
            SELECT 
                r.timestamp,
                SUM(COALESCE(r.kwh_dlv, 0)) as total_kwh_dlv,
                SUM(COALESCE(r.kwh_rcv, 0)) as total_kwh_rcv,
                SUM(COALESCE(r.kwh_dlv, 0) * pw.wa) as kwh_a,
                SUM(COALESCE(r.kwh_dlv, 0) * pw.wb) as kwh_b,
                SUM(COALESCE(r.kwh_dlv, 0) * pw.wc) as kwh_c,
                MAX(w.temperature) as temperature
            FROM read_parquet('{self.parquet_dir.replace("\\", "/")}/*.parquet') r
            JOIN phase_weights pw ON r.node_id = pw.node_id
            LEFT JOIN weather_recordings w 
                ON w.month = EXTRACT(month FROM r.timestamp)
                AND w.day = EXTRACT(day FROM r.timestamp)
                AND w.hour = EXTRACT(hour FROM r.timestamp)
            WHERE r.timestamp >= CAST(? AS TIMESTAMP)
              AND r.timestamp <= CAST(? AS TIMESTAMP)
            GROUP BY r.timestamp
            ORDER BY r.timestamp ASC
        """
        
        try:
            with duckdb.connect(self.db_path, read_only=True) as conn:
                print(f"DEBUG: SQL: {query}")
                results = conn.execute(query, query_params).fetchall()
                
            time_series = [
                {
                    "timestamp": row[0].isoformat() + "Z",
                    "kwh_delivered": float(row[1]),
                    "kwh_received": float(row[2]),
                    "net_consumption": float(row[1]) - float(row[2]),
                    "kwh_a": float(row[3]),
                    "kwh_b": float(row[4]),
                    "kwh_c": float(row[5]),
                    "temperature": float(row[6]) if row[6] else 0
                }
                for row in results
            ]
            
            return {
                "start_node_ids": start_node_ids,
                "node_count": len(nodes_to_query),
                "downstream_node_ids": nodes_to_query,
                "downstream_edge_ids": list(all_downstream_edges),
                "time_series": time_series
            }
        except Exception as e:
             return {"error": str(e)}
