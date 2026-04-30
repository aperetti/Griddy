import duckdb
import os
import logging
import threading
import time
import pyarrow as pa
from contextlib import contextmanager
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone
from pathlib import Path
from src.shared.meter_data_repository import (
    IMeterDataRepository, 
    EstimateResult, 
    ConsumptionTimeseriesPoint, 
    VoltageDistributionResult, 
    MapAggregationPoint, 
    PhaseBalancingResult
)
from src.shared.database_setup import DB_PATH, ADMIN_SQLITE_PATH, PARQUET_DIR, to_int_id

logger = logging.getLogger(__name__)

class DuckDBMeterDataRepository(IMeterDataRepository):
    """DuckDB implementation with persistent metadata caching and SQL-level weather joining."""
    
    name = "duckdb"
    label = "DuckDB (Local Parquet)"

    def __init__(self, db_path: str, parquet_dir: str):
        self.db_path = db_path
        self.parquet_dir = parquet_dir
        self._all_parquet_files: list[Path] = []
        self._last_scan_time = 0
        self._thread_local = threading.local()

    @contextmanager
    def _get_connection(self):
        """Yield a persistent per-thread DuckDB connection."""
        local = self._thread_local
        if not getattr(local, "conn", None):
            local.conn = duckdb.connect(self.db_path, read_only=True)
            threads = int(os.getenv("DUCKDB_THREADS", "2"))
            mem_limit = os.getenv("DUCKDB_MEMORY_LIMIT", "3GB")
            local.conn.execute(f"SET threads = {threads}")
            local.conn.execute(f"SET memory_limit = '{mem_limit}'")
            local.conn.execute("SET preserve_insertion_order=false")
            local.conn.execute("SET binary_as_string=true")
        yield local.conn

    def _parse_time(self, t_str: str) -> datetime:
        cleaned = t_str.replace("Z", "+00:00")
        dt = datetime.fromisoformat(cleaned)
        if dt.tzinfo is None: dt = dt.replace(tzinfo=timezone.utc)
        return dt

    def _get_parquet_range_files(self, start_time: str, end_time: str) -> List[str]:
        if not os.path.exists(self.parquet_dir): return []
        now = time.time()
        if now - self._last_scan_time > 60:
            self._all_parquet_files = list(Path(self.parquet_dir).glob("readings_*.parquet"))
            self._last_scan_time = now
        try:
            start_dt, end_dt = self._parse_time(start_time), self._parse_time(end_time)
        except ValueError:
            return [str(f).replace("\\", "/") for f in self._all_parquet_files]
        
        data_start = datetime(2025, 1, 1, tzinfo=timezone.utc)
        if start_dt < data_start: start_dt = data_start
        
        covered = set()
        curr = start_dt.replace(day=1)
        while curr.date() <= end_dt.date() and curr.year <= datetime.now().year + 1:
            covered.add(curr.strftime("%Y_%m"))
            if curr.month == 12: curr = curr.replace(year=curr.year + 1, month=1)
            else: curr = curr.replace(month=curr.month + 1)
        
        relevant = [str(f).replace("\\", "/") for f in self._all_parquet_files if any(m in f.name for m in covered)]
        return relevant or [str(f).replace("\\", "/") for f in self._all_parquet_files]

    def _get_node_table(self, node_ids: List[str]) -> pa.Table:
        int_ids = list(set(to_int_id(nid) for nid in node_ids))
        return pa.Table.from_arrays([pa.array(int_ids, type=pa.int64())], names=["node_id_int"])

    def estimate_aggregate_consumption(self, node_ids: List[str], start_time: str, end_time: str) -> EstimateResult:
        if not node_ids: return {"estimated_rows": 0}
        t0 = time.perf_counter()
        files = self._get_parquet_range_files(start_time, end_time)
        source = f"read_parquet({files})"
        st_lit, et_lit = start_time.replace("'", "''"), end_time.replace("'", "''")
        node_table = self._get_node_table(node_ids)
        
        with self._get_connection() as conn:
            conn.register("node_table", node_table)
            try:
                query = f"SELECT COUNT(*) FROM {source} r INNER JOIN node_table n ON r.node_id_int = n.node_id_int WHERE r.timestamp >= '{st_lit}'::TIMESTAMP AND r.timestamp <= '{et_lit}'::TIMESTAMP"
                if logger.isEnabledFor(logging.DEBUG):
                    explain = conn.execute(f"EXPLAIN ANALYZE {query}").fetchall()
                    logger.debug("EXPLAIN ANALYZE estimate:\n%s", explain[0][1])
                res = conn.execute(query).fetchone()[0]
            finally:
                conn.unregister("node_table")
        
        logger.debug("estimate for %d nodes took %.2fms (res=%s)", len(node_ids), (time.perf_counter()-t0)*1000, res)
        return {"estimated_rows": int(res)}

    def get_aggregate_consumption(self, node_ids, node_weights, start_time, end_time) -> List[ConsumptionTimeseriesPoint]:
        if not node_ids: return []
        t_total_start = time.perf_counter()
        files = self._get_parquet_range_files(start_time, end_time)
        source = f"read_parquet({files})"
        st_lit, et_lit = start_time.replace("'", "''"), end_time.replace("'", "''")
        node_table = self._get_node_table(node_ids)
        
        with self._get_connection() as conn:
            conn.register("node_table", node_table)
            try:
                query = f"""
                    SELECT 
                        r.timestamp, 
                        SUM(COALESCE(r.kwh_dlv, 0)), 
                        SUM(COALESCE(r.kwh_rcv, 0)),
                        ANY_VALUE(w.temperature)
                    FROM {source} r 
                    INNER JOIN node_table n ON r.node_id_int = n.node_id_int 
                    LEFT JOIN weather_recordings w ON (
                        EXTRACT(MONTH FROM r.timestamp) = w.month AND
                        EXTRACT(DAY FROM r.timestamp) = w.day AND
                        EXTRACT(HOUR FROM r.timestamp) = w.hour
                    )
                    WHERE r.timestamp >= '{st_lit}'::TIMESTAMP AND r.timestamp <= '{et_lit}'::TIMESTAMP 
                    GROUP BY 1 ORDER BY 1 ASC
                """
                if logger.isEnabledFor(logging.DEBUG):
                    explain = conn.execute(f"EXPLAIN ANALYZE {query}").fetchall()
                    logger.debug("EXPLAIN ANALYZE get_consumption:\n%s", explain[0][1])
                
                t0 = time.perf_counter()
                results = conn.execute(query).fetchall()
                t_query = (time.perf_counter() - t0) * 1000
            finally:
                conn.unregister("node_table")
        
        t1 = time.perf_counter()
        output = [{
            "timestamp": r[0].isoformat() + "Z",
            "kwh_delivered": float(r[1]),
            "kwh_received": float(r[2]),
            "temperature": float(r[3]) if r[3] is not None else 20.0
        } for r in results]
        t_py = (time.perf_counter() - t1) * 1000
        
        logger.debug("get_consumption total took %.2fms (query=%.2fms, py=%.2fms)", (time.perf_counter()-t_total_start)*1000, t_query, t_py)
        return output

    def estimate_voltage_distribution(self, node_ids: List[str], start_time: str, end_time: str) -> EstimateResult:
        return self.estimate_aggregate_consumption(node_ids, start_time, end_time)

    def get_voltage_distribution(self, node_ids: List[str], start_time: str, end_time: str) -> VoltageDistributionResult:
        if not node_ids: return {"distribution": [], "scatter": [], "timeseries": []}
        t_total_start = time.perf_counter()
        files = self._get_parquet_range_files(start_time, end_time)
        source = f"read_parquet({files})"
        st_lit, et_lit = start_time.replace("'", "''"), end_time.replace("'", "''")
        node_table = self._get_node_table(node_ids)
        
        with self._get_connection() as conn:
            conn.register("node_table", node_table)
            tmp_data = f"tmp_vdata_{int(time.time() * 1000)}"
            try:
                t0 = time.perf_counter()
                conn.execute(f"CREATE TEMP TABLE {tmp_data} AS SELECT r.timestamp, r.voltage_a, r.voltage_b, r.voltage_c, r.kwh_dlv FROM {source} r INNER JOIN node_table n ON r.node_id_int = n.node_id_int WHERE r.timestamp >= '{st_lit}'::TIMESTAMP AND r.timestamp <= '{et_lit}'::TIMESTAMP")
                t_scan = (time.perf_counter() - t0) * 1000
                
                t1 = time.perf_counter()
                bins = conn.execute(f"WITH raw AS (SELECT ROUND(voltage_a*2)/2.0 as v, 'a' as p FROM {tmp_data} WHERE voltage_a IS NOT NULL UNION ALL SELECT ROUND(voltage_b*2)/2.0 as v, 'b' as p FROM {tmp_data} WHERE voltage_b IS NOT NULL UNION ALL SELECT ROUND(voltage_c*2)/2.0 as v, 'c' as p FROM {tmp_data} WHERE voltage_c IS NOT NULL) SELECT v, COUNT(*) FILTER (WHERE p='a'), COUNT(*) FILTER (WHERE p='b'), COUNT(*) FILTER (WHERE p='c') FROM raw GROUP BY 1 ORDER BY 1 ASC").fetchall()
                t_bins = (time.perf_counter() - t1) * 1000
                
                t2 = time.perf_counter()
                heatmap = conn.execute(f"SELECT * FROM (WITH bucketed AS (SELECT time_bucket(INTERVAL '5 minutes', timestamp) as bucket, kwh_dlv, COALESCE(voltage_a, voltage_b, voltage_c) as voltage FROM {tmp_data}), total_loading AS (SELECT bucket, SUM(kwh_dlv) as total_kwh FROM bucketed GROUP BY 1) SELECT t.total_kwh as loading, b.voltage as voltage, CAST(COUNT(*) AS INTEGER) FROM bucketed b JOIN total_loading t ON b.bucket = t.bucket GROUP BY 1, 2) USING SAMPLE reservoir(5000)").fetchall()
                t_heatmap = (time.perf_counter() - t2) * 1000
                
                t3 = time.perf_counter()
                stability = conn.execute(f"SELECT time_bucket(INTERVAL '1 hour', timestamp) as bucket, quantile_cont(COALESCE(voltage_a, voltage_b, voltage_c), 0.1), quantile_cont(COALESCE(voltage_a, voltage_b, voltage_c), 0.5), quantile_cont(COALESCE(voltage_a, voltage_b, voltage_c), 0.9) FROM {tmp_data} GROUP BY 1 ORDER BY 1 ASC").fetchall()
                t_stability = (time.perf_counter() - t3) * 1000
            finally:
                conn.unregister("node_table")
                conn.execute(f"DROP TABLE IF EXISTS {tmp_data}")
        
        logger.debug("get_voltage total took %.2fms (scan=%.2fms, bins=%.2fms, heatmap=%.2fms, stability=%.2fms)", (time.perf_counter()-t_total_start)*1000, t_scan, t_bins, t_heatmap, t_stability)
        return {
            "distribution": [{"voltage": r[0], "phase_a": r[1], "phase_b": r[2], "phase_c": r[3]} for r in bins],
            "scatter": [{"loading": r[0], "voltage": r[1], "count": r[2]} for r in heatmap],
            "timeseries": [{"date": r[0].isoformat() + "Z", "p10": r[1], "p50": r[2], "p90": r[3]} for r in stability]
        }

    def estimate_map_voltage(self, start_time: str, end_time: str, agg: str, node_filter: Optional[List[str]] = None) -> EstimateResult:
        t0 = time.perf_counter()
        files = self._get_parquet_range_files(start_time, end_time)
        source = f"read_parquet({files})"
        st_lit, et_lit = start_time.replace("'", "''"), end_time.replace("'", "''")
        with self._get_connection() as conn:
            if node_filter:
                node_table = self._get_node_table(node_filter)
                conn.register("node_table", node_table)
                try:
                    res = conn.execute(f"SELECT COUNT(*) FROM {source} r INNER JOIN node_table n ON r.node_id_int = n.node_id_int WHERE r.timestamp >= '{st_lit}'::TIMESTAMP AND r.timestamp <= '{et_lit}'::TIMESTAMP").fetchone()[0]
                finally:
                    conn.unregister("node_table")
            else:
                res = conn.execute(f"SELECT COUNT(*) FROM {source} WHERE timestamp >= '{st_lit}'::TIMESTAMP AND timestamp <= '{et_lit}'::TIMESTAMP").fetchone()[0]
        return {"estimated_rows": int(res)}

    def get_map_voltage(self, start_time: str, end_time: str, agg: str, node_filter: Optional[List[str]] = None) -> List[MapAggregationPoint]:
        if not node_filter: return []
        t0 = time.perf_counter()
        files = self._get_parquet_range_files(start_time, end_time)
        source = f"read_parquet({files})"
        st_lit, et_lit = start_time.replace("'", "''"), end_time.replace("'", "''")
        agg_func = {"mean": "AVG", "min": "MIN", "max": "MAX", "median": "MEDIAN"}.get(agg, "AVG")
        node_table = self._get_node_table(node_filter)
        with self._get_connection() as conn:
            conn.register("node_table", node_table)
            try:
                results = conn.execute(f"SELECT r.node_id, {agg_func}(COALESCE(voltage_a, voltage_b, voltage_c)) FROM {source} r INNER JOIN node_table n ON r.node_id_int = n.node_id_int WHERE r.timestamp >= '{st_lit}'::TIMESTAMP AND r.timestamp <= '{et_lit}'::TIMESTAMP GROUP BY 1").fetchall()
            finally:
                conn.unregister("node_table")
        logger.debug("get_map_voltage took %.2fms", (time.perf_counter() - t0) * 1000)
        return [{"node_id": r[0], "value": float(r[1])} for r in results]

    def estimate_map_edge_load(self, start_time: str, end_time: str, agg: str, node_filter: Optional[List[str]] = None) -> EstimateResult:
        return self.estimate_map_voltage(start_time, end_time, agg, node_filter)

    def get_map_edge_load(self, start_time: str, end_time: str, agg: str, node_filter: Optional[List[str]] = None) -> List[MapAggregationPoint]:
        if not node_filter: return []
        t0 = time.perf_counter()
        files = self._get_parquet_range_files(start_time, end_time)
        source = f"read_parquet({files})"
        st_lit, et_lit = start_time.replace("'", "''"), end_time.replace("'", "''")
        agg_func = {"mean": "AVG", "min": "MIN", "max": "MAX", "median": "MEDIAN"}.get(agg, "AVG")
        node_table = self._get_node_table(node_filter)
        with self._get_connection() as conn:
            conn.register("node_table", node_table)
            try:
                results = conn.execute(f"SELECT r.node_id, {agg_func}(COALESCE(kwh_dlv, 0)) FROM {source} r INNER JOIN node_table n ON r.node_id_int = n.node_id_int WHERE r.timestamp >= '{st_lit}'::TIMESTAMP AND r.timestamp <= '{et_lit}'::TIMESTAMP GROUP BY 1").fetchall()
            finally:
                conn.unregister("node_table")
        logger.debug("get_map_edge_load took %.2fms", (time.perf_counter() - t0) * 1000)
        return [{"node_id": r[0], "value": float(r[1])} for r in results]

    def get_phase_balancing(self, node_ids: List[str], start_time: str, end_time: str) -> PhaseBalancingResult:
        if not node_ids: return {}
        t0 = time.perf_counter()
        files = self._get_parquet_range_files(start_time, end_time)
        source = f"read_parquet({files})"
        st_lit, et_lit = start_time.replace("'", "''"), end_time.replace("'", "''")
        node_table = self._get_node_table(node_ids)
        with self._get_connection() as conn:
            conn.register("node_table", node_table)
            try:
                results = conn.execute(f"SELECT r.timestamp, SUM(COALESCE(current_a, 0)), SUM(COALESCE(current_b, 0)), SUM(COALESCE(current_c, 0)), SUM(COALESCE(kwh_dlv, 0)) FROM {source} r INNER JOIN node_table n ON r.node_id_int = n.node_id_int WHERE r.timestamp >= '{st_lit}'::TIMESTAMP AND r.timestamp <= '{et_lit}'::TIMESTAMP GROUP BY 1").fetchall()
            finally:
                conn.unregister("node_table")
        logger.debug("get_phase_balancing took %.2fms", (time.perf_counter() - t0) * 1000)
        return {"results": [{"timestamp": r[0].isoformat() + "Z", "current_a": float(r[1]), "current_b": float(r[2]), "current_c": float(r[3]), "kwh": float(r[4])} for r in results]} if results else {}
