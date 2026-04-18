import duckdb
import os
import logging
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime
from pathlib import Path
from .meter_data_repository import (
    IMeterDataRepository, 
    EstimateResult, 
    ConsumptionTimeseriesPoint, 
    VoltageDistributionResult, 
    MapAggregationPoint, 
    PhaseBalancingResult
)

logger = logging.getLogger(__name__)

def _safe_parquet_path(path: str) -> str:
    """Return a SQL-safe parquet directory path or raise ValueError."""
    if "'" in path or '"' in path:
        raise ValueError(f"PARQUET_DIR contains invalid characters: {path!r}")
    return path.replace("\\", "/")

class DuckDBMeterDataRepository(IMeterDataRepository):
    """DuckDB implementation of the meter data repository."""

    def __init__(self, db_path: str, parquet_dir: str):
        self.db_path = db_path
        self.parquet_dir = parquet_dir

    def _get_connection(self):
        return duckdb.connect(self.db_path, read_only=True)

    def _get_parquet_range_files(self, start_time: str, end_time: str) -> List[str]:
        """Prunes the list of Parquet files based on YYYY_MM in filenames."""
        if not os.path.exists(self.parquet_dir):
            return []

        try:
            s = start_time.replace("Z", "+00:00")
            e = end_time.replace("Z", "+00:00")
            start_dt = datetime.fromisoformat(s)
            end_dt = datetime.fromisoformat(e)
        except ValueError as ex:
            logger.warning(f"Malformed date provided: {start_time} - {ex}")
            return [str(p) for p in Path(self.parquet_dir).glob("*.parquet")]

        covered_months = set()
        curr = start_dt.replace(day=1)
        while curr.date() <= end_dt.date():
            covered_months.add(curr.strftime("%Y_%m"))
            if curr.month == 12:
                curr = curr.replace(year=curr.year + 1, month=1)
            else:
                curr = curr.replace(month=curr.month + 1)

        all_files = list(Path(self.parquet_dir).glob("readings_unified_*.parquet"))
        relevant_files = []
        for f in all_files:
            for month_str in covered_months:
                if month_str in f.name:
                    relevant_files.append(str(f).replace("\\", "/"))
                    break

        if not relevant_files:
            relevant_files = [str(p).replace("\\", "/") for p in Path(self.parquet_dir).glob("*.parquet")]

        return relevant_files

    def estimate_aggregate_consumption(self, node_ids: List[str], start_time: str, end_time: str) -> EstimateResult:
        with self._get_connection() as conn:
            placeholders = ",".join(["?"] * len(node_ids))
            query_params = node_ids + [start_time, end_time]
            relevant_files = self._get_parquet_range_files(start_time, end_time)
            if not relevant_files:
                return {"estimated_rows": 0}
            parquet_list = str(relevant_files)
            
            query = f"""
                SELECT COUNT(*) as estimated_rows
                FROM read_parquet({parquet_list}) r
                WHERE r.node_id IN ({placeholders})
                  AND r.timestamp >= CAST(? AS TIMESTAMP)
                  AND r.timestamp <= CAST(? AS TIMESTAMP)
            """
            res = conn.execute(query, query_params).fetchone()
        return {"estimated_rows": res[0] if res else 0}

    def get_aggregate_consumption(self, node_ids: List[str], node_weights: Dict[str, Dict[str, float]], start_time: str, end_time: str) -> List[ConsumptionTimeseriesPoint]:
        weight_placeholders = []
        weight_params = []
        for nid in node_ids:
            w = node_weights.get(nid, {"A": 1.0/3.0, "B": 1.0/3.0, "C": 1.0/3.0})
            weight_placeholders.append("(?, ?, ?, ?)")
            weight_params.extend([nid, w.get('A', 0.0), w.get('B', 0.0), w.get('C', 0.0)])

        values_clause = ",".join(weight_placeholders)
        query_params = weight_params + [start_time, end_time]
        relevant_files = self._get_parquet_range_files(start_time, end_time)
        if not relevant_files:
            return []
        parquet_list = str(relevant_files)
        
        query = f"""
            WITH phase_weights(node_id, wa, wb, wc) AS (
                VALUES {values_clause}
            ),
            aggregated AS (
                SELECT
                    r.timestamp,
                    SUM(COALESCE(r.kwh_dlv, 0)) as total_kwh_dlv,
                    SUM(COALESCE(r.kwh_rcv, 0)) as total_kwh_rcv,
                    SUM(COALESCE(r.kwh_dlv, 0) * pw.wa) as kwh_a,
                    SUM(COALESCE(r.kwh_dlv, 0) * pw.wb) as kwh_b,
                    SUM(COALESCE(r.kwh_dlv, 0) * pw.wc) as kwh_c
                FROM read_parquet({parquet_list}) r
                JOIN phase_weights pw ON r.node_id = pw.node_id
                WHERE r.timestamp >= CAST(? AS TIMESTAMP)
                  AND r.timestamp <= CAST(? AS TIMESTAMP)
                GROUP BY r.timestamp
            )
            SELECT 
                a.timestamp, a.total_kwh_dlv, a.total_kwh_rcv,
                a.kwh_a, a.kwh_b, a.kwh_c, w.temperature
            FROM aggregated a
            LEFT JOIN weather_recordings w 
                ON w.month = EXTRACT(month FROM a.timestamp)
                AND w.day = EXTRACT(day FROM a.timestamp)
                AND w.hour = EXTRACT(hour FROM a.timestamp)
            ORDER BY a.timestamp ASC
        """
        with self._get_connection() as conn:
            results = conn.execute(query, query_params).fetchall()
        
        return [
            {
                "timestamp": row[0].isoformat() + "Z",
                "kwh_delivered": float(row[1]),
                "kwh_received": float(row[2]),
                "kwh_a": float(row[3]),
                "kwh_b": float(row[4]),
                "kwh_c": float(row[5]),
                "temperature": float(row[6]) if row[6] is not None else None
            } for row in results
        ]

    def estimate_voltage_distribution(self, node_ids: List[str], start_time: str, end_time: str) -> EstimateResult:
        with self._get_connection() as conn:
            placeholders = ",".join(["?"] * len(node_ids))
            query_params = node_ids + [start_time, end_time]
            relevant_files = self._get_parquet_range_files(start_time, end_time)
            if not relevant_files:
                return {"estimated_rows": 0}
            parquet_list = str(relevant_files)
            
            query = f"""
                SELECT COUNT(*) as estimated_rows
                FROM read_parquet({parquet_list})
                WHERE node_id IN ({placeholders})
                  AND timestamp >= CAST(? AS TIMESTAMP)
                  AND timestamp <= CAST(? AS TIMESTAMP)
            """
            res = conn.execute(query, query_params).fetchone()
        return {"estimated_rows": res[0] if res else 0}

    def get_voltage_distribution(self, node_ids: List[str], start_time: str, end_time: str) -> VoltageDistributionResult:
        # Ensure connection works first (prioritize connection errors)
        with self._get_connection() as conn:
            placeholders = ",".join(["?"] * len(node_ids))
            query_params = node_ids + [start_time, end_time]
            relevant_files = self._get_parquet_range_files(start_time, end_time)
            if not relevant_files:
                return {"distribution": [], "scatter": [], "timeseries": []}
            parquet_list = str(relevant_files)
            
            # 1. Distribution (KDE-like bins)
            query_bins = f"""
                WITH raw_readings AS (
                    SELECT node_id, timestamp, voltage_a, voltage_b, voltage_c
                    FROM read_parquet({parquet_list})
                    WHERE node_id IN ({placeholders})
                      AND timestamp >= CAST(? AS TIMESTAMP)
                      AND timestamp <= CAST(? AS TIMESTAMP)
                ),
                a_bins AS (
                    SELECT ROUND(voltage_a * 2) / 2.0 as v_bin, COUNT(*) as cnt_a
                    FROM raw_readings WHERE voltage_a IS NOT NULL GROUP BY 1
                ),
                b_bins AS (
                    SELECT ROUND(voltage_b * 2) / 2.0 as v_bin, COUNT(*) as cnt_b
                    FROM raw_readings WHERE voltage_b IS NOT NULL GROUP BY 1
                ),
                c_bins AS (
                    SELECT ROUND(voltage_c * 2) / 2.0 as v_bin, COUNT(*) as cnt_c
                    FROM raw_readings WHERE voltage_c IS NOT NULL GROUP BY 1
                ),
                all_bins AS (
                    SELECT v_bin FROM a_bins UNION SELECT v_bin FROM b_bins UNION SELECT v_bin FROM c_bins
                )
                SELECT all_bins.v_bin, COALESCE(a_bins.cnt_a, 0), COALESCE(b_bins.cnt_b, 0), COALESCE(c_bins.cnt_c, 0)
                FROM all_bins
                LEFT JOIN a_bins ON all_bins.v_bin = a_bins.v_bin
                LEFT JOIN b_bins ON all_bins.v_bin = b_bins.v_bin
                LEFT JOIN c_bins ON all_bins.v_bin = c_bins.v_bin
                ORDER BY 1 ASC
            """
            bins = conn.execute(query_bins, query_params).fetchall()

            # 2. Scatter (Heatmap)
            query_heatmap = f"""
                SELECT * FROM (
                    WITH raw_readings AS (
                        SELECT 
                            time_bucket(INTERVAL '5 minutes', timestamp) as bucket,
                            node_id, kwh_dlv, COALESCE(voltage_a, voltage_b, voltage_c) as voltage
                        FROM read_parquet({parquet_list})
                        WHERE node_id IN ({placeholders})
                          AND timestamp >= CAST(? AS TIMESTAMP)
                          AND timestamp <= CAST(? AS TIMESTAMP)
                    ),
                    total_loading AS (
                        SELECT bucket, SUM(kwh_dlv) as total_kwh
                        FROM raw_readings WHERE kwh_dlv IS NOT NULL GROUP BY 1
                    )
                    SELECT t.total_kwh as loading, r.voltage as voltage, CAST(COUNT(*) AS INTEGER) as cnt
                    FROM raw_readings r
                    JOIN total_loading t ON r.bucket = t.bucket
                    WHERE r.voltage IS NOT NULL AND t.total_kwh IS NOT NULL
                    GROUP BY 1, 2
                ) USING SAMPLE reservoir(10000)
            """
            heatmap = conn.execute(query_heatmap, query_params).fetchall()

            # 3. Timeseries (Stability with percentiles)
            query_stability = f"""
                SELECT 
                    time_bucket(INTERVAL '1 hour', timestamp) as bucket,
                    quantile_cont(COALESCE(voltage_a, voltage_b, voltage_c), 0.1) as p10,
                    quantile_cont(COALESCE(voltage_a, voltage_b, voltage_c), 0.5) as p50,
                    quantile_cont(COALESCE(voltage_a, voltage_b, voltage_c), 0.9) as p90
                FROM read_parquet({parquet_list})
                WHERE node_id IN ({placeholders})
                  AND timestamp >= CAST(? AS TIMESTAMP)
                  AND timestamp <= CAST(? AS TIMESTAMP)
                GROUP BY 1 ORDER BY 1 ASC
            """
            stability = conn.execute(query_stability, query_params).fetchall()

        return {
            "distribution": [{"voltage": r[0], "phase_a": r[1], "phase_b": r[2], "phase_c": r[3]} for r in bins],
            "scatter": [{"loading": r[0], "voltage": r[1], "count": r[2]} for r in heatmap],
            "timeseries": [{"date": r[0].isoformat() + "Z", "p10": r[1], "p50": r[2], "p90": r[3]} for r in stability]
        }

    def estimate_map_voltage(self, start_time: str, end_time: str, agg: str, node_filter: Optional[List[str]] = None) -> EstimateResult:
        relevant_files = self._get_parquet_range_files(start_time, end_time)
        if not relevant_files: return {"estimated_rows": 0}
        parquet_list = str([str(f) for f in relevant_files])
        query_params = [start_time, end_time]
        filter_clause = ""
        if node_filter:
            placeholders = ",".join(["?"] * len(node_filter))
            filter_clause = f"AND node_id IN ({placeholders})"
            query_params.extend(node_filter)
        
        query = f"""
            SELECT COUNT(*) FROM read_parquet({parquet_list})
            WHERE timestamp >= CAST(? AS TIMESTAMP) AND timestamp <= CAST(? AS TIMESTAMP)
            {filter_clause}
        """
        with self._get_connection() as conn:
            res = conn.execute(query, query_params).fetchone()
        return {"estimated_rows": res[0] if res else 0}

    def get_map_voltage(self, start_time: str, end_time: str, agg: str, node_filter: Optional[List[str]] = None) -> List[MapAggregationPoint]:
        # Ensure connection works first (prioritize connection errors)
        with self._get_connection() as conn:
            agg_func = {"mean": "AVG", "min": "MIN", "max": "MAX", "median": "MEDIAN"}.get(agg, "AVG")
            relevant_files = self._get_parquet_range_files(start_time, end_time)
            if not relevant_files:
                raise ValueError("No load data available in the requested range.")
            parquet_list = str([str(f) for f in relevant_files])
            query_params = [start_time, end_time]
            filter_clause = ""
            if node_filter:
                placeholders = ",".join(["?"] * len(node_filter))
                filter_clause = f"AND node_id IN ({placeholders})"
                query_params.extend(node_filter)

            query = f"""
                SELECT 
                    node_id,
                    {agg_func}(COALESCE(voltage_a, voltage_b, voltage_c)) as val
                FROM read_parquet({parquet_list})
                WHERE timestamp >= CAST(? AS TIMESTAMP) AND timestamp <= CAST(? AS TIMESTAMP)
                {filter_clause}
                GROUP BY node_id
            """
            results = conn.execute(query, query_params).fetchall()
        return [{"node_id": r[0], "value": float(r[1])} for r in results]

    def estimate_map_edge_load(self, start_time: str, end_time: str, agg: str, node_filter: Optional[List[str]] = None) -> EstimateResult:
        return self.estimate_map_voltage(start_time, end_time, agg, node_filter)

    def get_map_edge_load(self, start_time: str, end_time: str, agg: str, node_filter: Optional[List[str]] = None) -> List[MapAggregationPoint]:
        # Ensure connection works first (prioritize connection errors)
        with self._get_connection() as conn:
            agg_func = {"mean": "AVG", "min": "MIN", "max": "MAX", "median": "MEDIAN"}.get(agg, "AVG")
            relevant_files = self._get_parquet_range_files(start_time, end_time)
            if not relevant_files:
                raise ValueError("No load data available in the requested range.")
            parquet_list = str([str(f) for f in relevant_files])
            query_params = [start_time, end_time]
            filter_clause = ""
            if node_filter:
                placeholders = ",".join(["?"] * len(node_filter))
                filter_clause = f"AND node_id IN ({placeholders})"
                query_params.extend(node_filter)

            query = f"""
                SELECT 
                    node_id,
                    {agg_func}(COALESCE(kwh_dlv, 0)) as val
                FROM read_parquet({parquet_list})
                WHERE timestamp >= CAST(? AS TIMESTAMP) AND timestamp <= CAST(? AS TIMESTAMP)
                {filter_clause}
                GROUP BY node_id
            """
            results = conn.execute(query, query_params).fetchall()
        return [{"node_id": r[0], "value": float(r[1])} for r in results]

    def get_phase_balancing(self, node_ids: List[str], start_time: str, end_time: str) -> PhaseBalancingResult:
        placeholders = ",".join(["?"] * len(node_ids))
        query_params = node_ids + [start_time, end_time]
        safe_dir = _safe_parquet_path(self.parquet_dir)
        
        query = f"""
            SELECT 
                timestamp,
                SUM(COALESCE(current_a, 0)) as current_a,
                SUM(COALESCE(current_b, 0)) as current_b,
                SUM(COALESCE(current_c, 0)) as current_c,
                SUM(COALESCE(kwh_dlv, 0)) as kwh
            FROM read_parquet('{safe_dir}/*.parquet')
            WHERE node_id IN ({placeholders})
              AND timestamp >= CAST(? AS TIMESTAMP)
              AND timestamp <= CAST(? AS TIMESTAMP)
            GROUP BY timestamp
        """
        with self._get_connection() as conn:
            results = conn.execute(query, query_params).fetchall()
        
        if not results: return {}
        
        return {
            "results": [
                {
                    "timestamp": r[0].isoformat() + "Z",
                    "current_a": float(r[1]),
                    "current_b": float(r[2]),
                    "current_c": float(r[3]),
                    "kwh": float(r[4])
                } for r in results
            ]
        }
