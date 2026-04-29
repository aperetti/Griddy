import duckdb
import os
import logging
import threading
import time
from contextlib import contextmanager
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime
from pathlib import Path
from src.shared.meter_data_repository import (
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

import duckdb
import os
import logging
import threading
import time
import pyarrow as pa
from contextlib import contextmanager
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime
from pathlib import Path
from src.shared.meter_data_repository import (
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
    """DuckDB implementation of the meter data repository using zero-copy Arrow joins."""
    
    name = "duckdb"
    label = "DuckDB (Local Parquet)"

    def __init__(self, db_path: str, parquet_dir: str):
        self.db_path = db_path
        self.parquet_dir = parquet_dir
        self._all_parquet_files: list[Path] = []
        self._last_scan_time = 0
        self._weather_map: Optional[Dict[Tuple[int, int, int], float]] = None
        self._thread_local = threading.local()

    def _get_weather_map(self, conn) -> Dict[Tuple[int, int, int], float]:
        if self._weather_map is None:
            rows = conn.execute(
                "SELECT month, day, hour, temperature FROM weather_recordings"
            ).fetchall()
            self._weather_map = {(r[0], r[1], r[2]): r[3] for r in rows}
        return self._weather_map

    @contextmanager
    def _get_connection(self):
        """Yield a persistent per-thread read-only DuckDB connection."""
        local = self._thread_local
        if not getattr(local, "conn", None):
            local.conn = duckdb.connect(self.db_path, read_only=True)
            threads = int(os.getenv("DUCKDB_THREADS", "2"))
            mem_limit = os.getenv("DUCKDB_MEMORY_LIMIT", "1.5GB")
            local.conn.execute(f"SET threads = {threads}")
            local.conn.execute(f"SET memory_limit = '{mem_limit}'")
        yield local.conn

    def _get_parquet_range_files(self, start_time: str, end_time: str) -> List[str]:
        """Prunes the list of Parquet files based on YYYY_MM in filenames."""
        if not os.path.exists(self.parquet_dir):
            return []

        now = time.time()
        if now - self._last_scan_time > 60:
            self._all_parquet_files = list(Path(self.parquet_dir).glob("readings_*.parquet"))
            self._last_scan_time = now

        try:
            s = start_time.replace("Z", "+00:00")
            e = end_time.replace("Z", "+00:00")
            start_dt = datetime.fromisoformat(s)
            end_dt = datetime.fromisoformat(e)
        except ValueError as ex:
            logger.warning(f"Malformed date provided: {start_time} - {ex}")
            return [str(f).replace("\\", "/") for f in self._all_parquet_files]

        covered_months = set()
        curr = start_dt.replace(day=1)
        while curr.date() <= end_dt.date():
            covered_months.add(curr.strftime("%Y_%m"))
            if curr.month == 12:
                curr = curr.replace(year=curr.year + 1, month=1)
            else:
                curr = curr.replace(month=curr.month + 1)

        relevant_files = []
        for f in self._all_parquet_files:
            for month_str in covered_months:
                if month_str in f.name:
                    relevant_files.append(str(f).replace("\\", "/"))
                    break

        if not relevant_files:
            relevant_files = [str(f).replace("\\", "/") for f in self._all_parquet_files]

        return relevant_files

    def _get_read_parquet_sql(self, files: List[str]) -> str:
        """Returns a SQL expression that reads Parquet files with a stable schema."""
        if not files:
            return """(
                SELECT
                    CAST(NULL AS VARCHAR) as node_id,
                    CAST(NULL AS TIMESTAMP) as timestamp,
                    CAST(0.0 AS DOUBLE) as kwh_dlv,
                    CAST(0.0 AS DOUBLE) as kwh_rcv,
                    CAST(0.0 AS DOUBLE) as voltage_a,
                    CAST(0.0 AS DOUBLE) as voltage_b,
                    CAST(0.0 AS DOUBLE) as voltage_c,
                    CAST(0.0 AS DOUBLE) as current_a,
                    CAST(0.0 AS DOUBLE) as current_b,
                    CAST(0.0 AS DOUBLE) as current_c
                WHERE 1=0
            )"""
        parquet_list = str([str(f).replace("\\", "/") for f in files])
        return f"read_parquet({parquet_list})"

    def _get_node_table(self, node_ids: List[str]) -> pa.Table:
        """Create a single-column Arrow Table with lowercased IDs for zero-copy joins."""
        lowercased = [nid.lower() for nid in node_ids]
        return pa.Table.from_arrays([pa.array(lowercased)], names=["node_id"])

    def estimate_aggregate_consumption(self, node_ids: List[str], start_time: str, end_time: str) -> EstimateResult:
        if not node_ids: return {"estimated_rows": 0}
        t0 = time.perf_counter()
        node_table = self._get_node_table(node_ids)
        
        with self._get_connection() as conn:
            relevant_files = self._get_parquet_range_files(start_time, end_time)
            source_sql = self._get_read_parquet_sql(relevant_files)
            
            # Using JOIN against node_table (detected as a local variable by DuckDB)
            # This allows DuckDB to push a perfect Hash Join/Filter into the Parquet scanner.
            query = f"""
                SELECT COUNT(*) as estimated_rows
                FROM {source_sql} r
                JOIN node_table n ON (r.node_id = n.node_id)
                WHERE r.timestamp >= CAST(? AS TIMESTAMP)
                  AND r.timestamp <= CAST(? AS TIMESTAMP)
            """
            
            if logger.isEnabledFor(logging.DEBUG):
                try:
                    explain = conn.execute(f"EXPLAIN ANALYZE {query}", [start_time, end_time]).fetchall()
                    logger.debug("EXPLAIN ANALYZE estimate_aggregate_consumption:\n%s", explain[0][1] if explain else "No plan")
                except Exception as e:
                    logger.debug("EXPLAIN ANALYZE failed: %s", e)

            res = conn.execute(query, [start_time, end_time]).fetchone()
            duration = (time.perf_counter() - t0) * 1000
            logger.debug("estimate_aggregate_consumption for %d nodes took %.2fms", len(node_ids), duration)
        return {"estimated_rows": res[0] if res else 0}

    def get_aggregate_consumption(self, node_ids: List[str], node_weights: Dict[str, Dict[str, float]], start_time: str, end_time: str) -> List[ConsumptionTimeseriesPoint]:
        if not node_ids: return []
        t_start = time.perf_counter()
        node_table = self._get_node_table(node_ids)

        relevant_files = self._get_parquet_range_files(start_time, end_time)
        source_sql = self._get_read_parquet_sql(relevant_files)

        query = f"""
            SELECT
                r.timestamp,
                SUM(COALESCE(r.kwh_dlv, 0)) as total_dlv,
                SUM(COALESCE(r.kwh_rcv, 0)) as total_rcv
            FROM {source_sql} r
            JOIN node_table n ON (r.node_id = n.node_id)
            WHERE r.timestamp >= CAST(? AS TIMESTAMP)
              AND r.timestamp <= CAST(? AS TIMESTAMP)
            GROUP BY r.timestamp
            ORDER BY r.timestamp ASC
        """
        params = [start_time, end_time]

        t0 = time.perf_counter()
        with self._get_connection() as conn:
            if logger.isEnabledFor(logging.DEBUG):
                try:
                    explain = conn.execute(f"EXPLAIN ANALYZE {query}", params).fetchall()
                    logger.debug("EXPLAIN ANALYZE get_aggregate_consumption:\n%s", explain[0][1] if explain else "No plan")
                except Exception as e:
                    logger.debug("EXPLAIN ANALYZE failed: %s", e)

            results = conn.execute(query, params).fetchall()
            weather_map = self._get_weather_map(conn)
        
        t_query = (time.perf_counter() - t0) * 1000
        
        t1 = time.perf_counter()
        output = []
        for row in results:
            ts = row[0]
            dt = ts if isinstance(ts, datetime) else datetime.fromisoformat(ts.isoformat())
            temp = weather_map.get((dt.month, dt.day, dt.hour))
            
            output.append({
                "timestamp": dt.isoformat() + "Z",
                "kwh_delivered": float(row[1]),
                "kwh_received": float(row[2]),
                "temperature": float(temp) if temp is not None else None
            })
        t_py = (time.perf_counter() - t1) * 1000
        t_total = (time.perf_counter() - t_start) * 1000
        
        logger.debug(
            "get_aggregate_consumption for %d nodes: total=%.2fms (query=%.2fms, py_process=%.2fms, rows=%d)",
            len(node_ids), t_total, t_query, t_py, len(output)
        )
        return output

    def estimate_voltage_distribution(self, node_ids: List[str], start_time: str, end_time: str) -> EstimateResult:
        if not node_ids: return {"estimated_rows": 0}
        node_table = self._get_node_table(node_ids)
        with self._get_connection() as conn:
            relevant_files = self._get_parquet_range_files(start_time, end_time)
            source_sql = self._get_read_parquet_sql(relevant_files)
            
            query = f"""
                SELECT COUNT(*) as estimated_rows
                FROM {source_sql} r
                JOIN node_table n ON (r.node_id = n.node_id)
                WHERE r.timestamp >= CAST(? AS TIMESTAMP)
                  AND r.timestamp <= CAST(? AS TIMESTAMP)
            """
            res = conn.execute(query, [start_time, end_time]).fetchone()
        return {"estimated_rows": res[0] if res else 0}

    def get_voltage_distribution(self, node_ids: List[str], start_time: str, end_time: str) -> VoltageDistributionResult:
        if not node_ids: return {"distribution": [], "scatter": [], "timeseries": []}
        node_table = self._get_node_table(node_ids)
        with self._get_connection() as conn:
            relevant_files = self._get_parquet_range_files(start_time, end_time)
            source_sql = self._get_read_parquet_sql(relevant_files)
            
            # Using temporary table created from Arrow Table to optimize multi-query performance
            tmp_table = f"tmp_vdist_{int(time.time() * 1000)}"
            conn.execute(f"CREATE TEMP TABLE {tmp_table} AS SELECT * FROM node_table")
            
            try:
                # 1. Distribution (KDE-like bins)
                query_bins = f"""
                    WITH raw_readings AS (
                        SELECT r.node_id, r.timestamp, r.voltage_a, r.voltage_b, r.voltage_c
                        FROM {source_sql} r
                        JOIN {tmp_table} tn ON r.node_id = tn.node_id
                        WHERE r.timestamp >= CAST(? AS TIMESTAMP)
                          AND r.timestamp <= CAST(? AS TIMESTAMP)
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
                bins = conn.execute(query_bins, [start_time, end_time]).fetchall()

                # 2. Scatter (Heatmap)
                query_heatmap = f"""
                    SELECT * FROM (
                        WITH raw_readings AS (
                            SELECT 
                                time_bucket(INTERVAL '5 minutes', timestamp) as bucket,
                                r.node_id, r.kwh_dlv, COALESCE(r.voltage_a, r.voltage_b, r.voltage_c) as voltage
                            FROM {source_sql} r
                            JOIN {tmp_table} tn ON r.node_id = tn.node_id
                            WHERE r.timestamp >= CAST(? AS TIMESTAMP)
                              AND r.timestamp <= CAST(? AS TIMESTAMP)
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
                heatmap = conn.execute(query_heatmap, [start_time, end_time]).fetchall()

                # 3. Timeseries (Stability with percentiles)
                query_stability = f"""
                    SELECT 
                        time_bucket(INTERVAL '1 hour', timestamp) as bucket,
                        quantile_cont(COALESCE(r.voltage_a, r.voltage_b, r.voltage_c), 0.1) as p10,
                        quantile_cont(COALESCE(r.voltage_a, r.voltage_b, r.voltage_c), 0.5) as p50,
                        quantile_cont(COALESCE(r.voltage_a, r.voltage_b, r.voltage_c), 0.9) as p90
                    FROM {source_sql} r
                    JOIN {tmp_table} tn ON r.node_id = tn.node_id
                    WHERE r.timestamp >= CAST(? AS TIMESTAMP)
                      AND r.timestamp <= CAST(? AS TIMESTAMP)
                    GROUP BY 1 ORDER BY 1 ASC
                """
                stability = conn.execute(query_stability, [start_time, end_time]).fetchall()
            finally:
                conn.execute(f"DROP TABLE IF EXISTS {tmp_table}")

        return {
            "distribution": [{"voltage": r[0], "phase_a": r[1], "phase_b": r[2], "phase_c": r[3]} for r in bins],
            "scatter": [{"loading": r[0], "voltage": r[1], "count": r[2]} for r in heatmap],
            "timeseries": [{"date": r[0].isoformat() + "Z", "p10": r[1], "p50": r[2], "p90": r[3]} for r in stability]
        }

    def estimate_map_voltage(self, start_time: str, end_time: str, agg: str, node_filter: Optional[List[str]] = None) -> EstimateResult:
        relevant_files = self._get_parquet_range_files(start_time, end_time)
        source_sql = self._get_read_parquet_sql(relevant_files)
        node_table = self._get_node_table(node_filter) if node_filter else None
        
        with self._get_connection() as conn:
            if node_table is not None:
                query = f"""
                    SELECT COUNT(*) FROM {source_sql} r
                    JOIN node_table n ON (r.node_id = n.node_id)
                    WHERE r.timestamp >= CAST(? AS TIMESTAMP) AND r.timestamp <= CAST(? AS TIMESTAMP)
                """
                res = conn.execute(query, [start_time, end_time]).fetchone()
            else:
                query = f"""
                    SELECT COUNT(*) FROM {source_sql}
                    WHERE timestamp >= CAST(? AS TIMESTAMP) AND timestamp <= CAST(? AS TIMESTAMP)
                """
                res = conn.execute(query, [start_time, end_time]).fetchone()
        return {"estimated_rows": res[0] if res else 0}

    def get_map_voltage(self, start_time: str, end_time: str, agg: str, node_filter: Optional[List[str]] = None) -> List[MapAggregationPoint]:
        relevant_files = self._get_parquet_range_files(start_time, end_time)
        source_sql = self._get_read_parquet_sql(relevant_files)
        node_table = self._get_node_table(node_filter) if node_filter else None
        
        with self._get_connection() as conn:
            agg_func = {"mean": "AVG", "min": "MIN", "max": "MAX", "median": "MEDIAN"}.get(agg, "AVG")
            
            if node_table is not None:
                query = f"""
                    SELECT 
                        r.node_id,
                        {agg_func}(COALESCE(voltage_a, voltage_b, voltage_c)) as val
                    FROM {source_sql} r
                    JOIN node_table n ON (r.node_id = n.node_id)
                    WHERE r.timestamp >= CAST(? AS TIMESTAMP) AND r.timestamp <= CAST(? AS TIMESTAMP)
                    GROUP BY r.node_id
                """
                results = conn.execute(query, [start_time, end_time]).fetchall()
            else:
                query = f"""
                    SELECT 
                        node_id,
                        {agg_func}(COALESCE(voltage_a, voltage_b, voltage_c)) as val
                    FROM {source_sql}
                    WHERE timestamp >= CAST(? AS TIMESTAMP) AND timestamp <= CAST(? AS TIMESTAMP)
                    GROUP BY node_id
                """
                results = conn.execute(query, [start_time, end_time]).fetchall()
        return [{"node_id": r[0], "value": float(r[1])} for r in results]

    def estimate_map_edge_load(self, start_time: str, end_time: str, agg: str, node_filter: Optional[List[str]] = None) -> EstimateResult:
        return self.estimate_map_voltage(start_time, end_time, agg, node_filter)

    def get_map_edge_load(self, start_time: str, end_time: str, agg: str, node_filter: Optional[List[str]] = None) -> List[MapAggregationPoint]:
        relevant_files = self._get_parquet_range_files(start_time, end_time)
        source_sql = self._get_read_parquet_sql(relevant_files)
        node_table = self._get_node_table(node_filter) if node_filter else None
        
        with self._get_connection() as conn:
            agg_func = {"mean": "AVG", "min": "MIN", "max": "MAX", "median": "MEDIAN"}.get(agg, "AVG")

            if node_table is not None:
                query = f"""
                    SELECT 
                        r.node_id,
                        {agg_func}(COALESCE(kwh_dlv, 0)) as val
                    FROM {source_sql} r
                    JOIN node_table n ON (r.node_id = n.node_id)
                    WHERE r.timestamp >= CAST(? AS TIMESTAMP) AND r.timestamp <= CAST(? AS TIMESTAMP)
                    GROUP BY r.node_id
                """
                results = conn.execute(query, [start_time, end_time]).fetchall()
            else:
                query = f"""
                    SELECT 
                        node_id,
                        {agg_func}(COALESCE(kwh_dlv, 0)) as val
                    FROM {source_sql}
                    WHERE timestamp >= CAST(? AS TIMESTAMP) AND timestamp <= CAST(? AS TIMESTAMP)
                    GROUP BY node_id
                """
                results = conn.execute(query, [start_time, end_time]).fetchall()
        return [{"node_id": r[0], "value": float(r[1])} for r in results]

    def get_phase_balancing(self, node_ids: List[str], start_time: str, end_time: str) -> PhaseBalancingResult:
        if not node_ids: return {}
        node_table = self._get_node_table(node_ids)
        relevant_files = self._get_parquet_range_files(start_time, end_time)
        source_sql = self._get_read_parquet_sql(relevant_files)
        
        query = f"""
            SELECT 
                r.timestamp,
                SUM(COALESCE(r.current_a, 0)) as current_a,
                SUM(COALESCE(r.current_b, 0)) as current_b,
                SUM(COALESCE(r.current_c, 0)) as current_c,
                SUM(COALESCE(r.kwh_dlv, 0)) as kwh
            FROM {source_sql} r
            JOIN node_table n ON (r.node_id = n.node_id)
            WHERE r.timestamp >= CAST(? AS TIMESTAMP)
              AND r.timestamp <= CAST(? AS TIMESTAMP)
            GROUP BY r.timestamp
        """
        with self._get_connection() as conn:
            results = conn.execute(query, [start_time, end_time]).fetchall()
        
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
