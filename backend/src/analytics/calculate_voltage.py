"""Use Case: Voltage Distribution."""
import duckdb
import logging
from typing import Dict, Any, List
from src.shared.graph_engine import GraphEngine

logger = logging.getLogger(__name__)


def _safe_parquet_path(path: str) -> str:
    """Return a SQL-safe parquet directory path or raise ValueError."""
    if "'" in path or '"' in path:
        raise ValueError(f"PARQUET_DIR contains invalid characters: {path!r}")
    return path.replace("\\", "/")

class CalculateVoltageDistributionUseCase:
    """Calculates voltage statistics (mean, median, stddev) for downstream meters."""
    
    def __init__(self, graph_engine: GraphEngine, db_path: str, parquet_dir: str = 'readings'):
        self.graph_engine = graph_engine
        self.db_path = db_path
        self.parquet_dir = parquet_dir
        
    def estimate(self, start_node_ids: List[str], start_time: str, end_time: str, degrees: int = None) -> Dict[str, Any]:
        """Returns the estimated number of rows to be processed for one or more starting nodes."""
        all_downstream_nodes = set()
        for node_id in start_node_ids:
            nodes, _ = self.graph_engine.find_downstream(node_id, max_depth=degrees)
            all_downstream_nodes.update(nodes)
        
        nodes_to_query = list(all_downstream_nodes) if all_downstream_nodes else start_node_ids
        placeholders = ",".join(["?"] * len(nodes_to_query))
        query_params = nodes_to_query + [start_time, end_time]
        
        safe_dir = _safe_parquet_path(self.parquet_dir)
        prefetch_query = f"""
            SELECT COUNT(*) as estimated_rows
            FROM read_parquet('{safe_dir}/*.parquet')
            WHERE node_id IN ({placeholders})
              AND timestamp >= CAST(? AS TIMESTAMP)
              AND timestamp <= CAST(? AS TIMESTAMP)
        """

        with duckdb.connect(self.db_path, read_only=True) as conn:
            prefetch_results = conn.execute(prefetch_query, query_params).fetchone()

        return {
            "estimated_rows": prefetch_results[0] if prefetch_results else 0,
            "node_count": len(nodes_to_query)
        }

    def execute(self, start_node_ids: List[str], start_time: str, end_time: str, degrees: int = None) -> Dict[str, Any]:
        """
        Executes the voltage distribution query for one or more starting nodes.
        """
        all_downstream_nodes = set()
        all_downstream_edges = set()
        for node_id in start_node_ids:
            nodes, edges = self.graph_engine.find_downstream(node_id, max_depth=degrees)
            all_downstream_nodes.update(nodes)
            all_downstream_edges.update(edges)
            
        nodes_to_query = list(all_downstream_nodes) if all_downstream_nodes else start_node_ids
        placeholders = ",".join(["?"] * len(nodes_to_query))
        query_params = nodes_to_query + [start_time, end_time]
        safe_dir = _safe_parquet_path(self.parquet_dir)

        query = f"""
            WITH raw_readings AS (
                SELECT node_id, timestamp, voltage_a, voltage_b, voltage_c
                FROM read_parquet('{safe_dir}/*.parquet')
                WHERE node_id IN ({placeholders})
                  AND timestamp >= CAST(? AS TIMESTAMP)
                  AND timestamp <= CAST(? AS TIMESTAMP)
            ),
            a_bins AS (
                SELECT ROUND(voltage_a * 2) / 2.0 as v_bin, COUNT(*) as cnt_a
                FROM raw_readings
                WHERE voltage_a IS NOT NULL
                GROUP BY 1
            ),
            b_bins AS (
                SELECT ROUND(voltage_b * 2) / 2.0 as v_bin, COUNT(*) as cnt_b
                FROM raw_readings
                WHERE voltage_b IS NOT NULL
                GROUP BY 1
            ),
            c_bins AS (
                SELECT ROUND(voltage_c * 2) / 2.0 as v_bin, COUNT(*) as cnt_c
                FROM raw_readings
                WHERE voltage_c IS NOT NULL
                GROUP BY 1
            ),
            all_bins AS (
                SELECT v_bin FROM a_bins
                UNION
                SELECT v_bin FROM b_bins
                UNION
                SELECT v_bin FROM c_bins
            )
            SELECT 
                all_bins.v_bin as voltage,
                COALESCE(a_bins.cnt_a, 0) as phase_a_count,
                COALESCE(b_bins.cnt_b, 0) as phase_b_count,
                COALESCE(c_bins.cnt_c, 0) as phase_c_count
            FROM all_bins
            LEFT JOIN a_bins ON all_bins.v_bin = a_bins.v_bin
            LEFT JOIN b_bins ON all_bins.v_bin = b_bins.v_bin
            LEFT JOIN c_bins ON all_bins.v_bin = c_bins.v_bin
            ORDER BY voltage ASC
        """
        heatmap_query = f"""
            SELECT * FROM (
                WITH raw_readings AS (
                    SELECT timestamp, node_id, kwh_dlv, voltage_a
                    FROM read_parquet('{safe_dir}/*.parquet')
                    WHERE node_id IN ({placeholders})
                      AND timestamp >= CAST(? AS TIMESTAMP)
                      AND timestamp <= CAST(? AS TIMESTAMP)
                ),
                total_loading AS (
                    SELECT timestamp, SUM(kwh_dlv) as total_kwh
                    FROM raw_readings
                    WHERE kwh_dlv IS NOT NULL
                    GROUP BY timestamp
                )
                SELECT 
                    t.total_kwh as loading,
                    r.voltage_a as voltage,
                    CAST(COUNT(*) AS INTEGER) as cnt
                FROM raw_readings r
                JOIN total_loading t ON r.timestamp = t.timestamp
                WHERE r.voltage_a IS NOT NULL
                  AND t.total_kwh IS NOT NULL
                GROUP BY 1, 2
            ) USING SAMPLE reservoir(10000)
        """
        
        timeseries_query = f"""
            SELECT
                CAST(timestamp AS DATE) as day,
                MEDIAN(voltage_a) as p50,
                QUANTILE_CONT(voltage_a, 0.1) as p10,
                QUANTILE_CONT(voltage_a, 0.9) as p90
            FROM read_parquet('{safe_dir}/*.parquet')
            WHERE node_id IN ({placeholders})
              AND timestamp >= CAST(? AS TIMESTAMP)
              AND timestamp <= CAST(? AS TIMESTAMP)
              AND voltage_a IS NOT NULL
            GROUP BY 1
            ORDER BY 1
        """

        stats_query = f"""
            SELECT AVG(voltage_a), MEDIAN(voltage_a)
            FROM read_parquet('{safe_dir}/*.parquet')
            WHERE node_id IN ({placeholders})
              AND timestamp >= CAST(? AS TIMESTAMP)
              AND timestamp <= CAST(? AS TIMESTAMP)
              AND voltage_a IS NOT NULL
        """

        with duckdb.connect(self.db_path, read_only=True) as conn:
            results = conn.execute(query, query_params).fetchall()
            heat_results = conn.execute(heatmap_query, query_params).fetchall()
            ts_results = conn.execute(timeseries_query, query_params).fetchall()
            overall_stats = conn.execute(stats_query, query_params).fetchone()

        distribution = [
            {
                "voltage": float(row[0]),
                "phase_a": int(row[1]),
                "phase_b": int(row[2]),
                "phase_c": int(row[3])
            }
            for row in results
        ]

        scatter = [
            {"voltage": float(row[1]), "loading": float(row[0]), "count": int(row[2])}
            for row in heat_results
        ]

        timeseries = [
            {
                "date": row[0].isoformat(),
                "p50": float(row[1]),
                "p10": float(row[2]),
                "p90": float(row[3])
            }
            for row in ts_results
        ]

        return {
            "start_node_id": start_node_ids[0] if len(start_node_ids) == 1 else "multiple",
            "start_node_ids": start_node_ids,
            "node_count": len(nodes_to_query),
            "downstream_node_ids": nodes_to_query,
            "downstream_edge_ids": list(all_downstream_edges),
            "mean_voltage": float(overall_stats[0]) if overall_stats and overall_stats[0] else 0,
            "median_voltage": float(overall_stats[1]) if overall_stats and overall_stats[1] else 0,
            "distribution": distribution,
            "scatter": scatter,
            "timeseries": timeseries
        }
