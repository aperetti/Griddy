import duckdb
import logging
from typing import List, Optional
from src.shared.repository import IAlarmRepository
from src.grid.alarm import Alarm

logger = logging.getLogger(__name__)

class DuckDBAlarmRepository(IAlarmRepository):
    """DuckDB implementation of the alarm repository."""

    def __init__(self, db_path: str):
        self.db_path = db_path

    def _get_connection(self):
        return duckdb.connect(self.db_path, read_only=True)

    def get_active_alarms(self, node_id: Optional[str] = None) -> List[Alarm]:
        with self._get_connection() as conn:
            if node_id:
                rows = conn.execute(
                    "SELECT alarm_id, node_id, timestamp, alarm_code, severity, message, is_active FROM alarms WHERE node_id = ? AND is_active = True",
                    [node_id]
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT alarm_id, node_id, timestamp, alarm_code, severity, message, is_active FROM alarms WHERE is_active = True"
                ).fetchall()
            
            return [
                Alarm(
                    alarm_id=r[0],
                    node_id=r[1],
                    timestamp=r[2],
                    alarm_code=r[3],
                    severity=r[4],
                    message=r[5],
                    is_active=bool(r[6])
                ) for r in rows
            ]

    def get_active_alarms_by_nodes(self, node_ids: List[str]) -> List[Alarm]:
        if not node_ids:
            return []
        with self._get_connection() as conn:
            # Use placeholders for the IN clause
            placeholders = ", ".join(["?" for _ in node_ids])
            rows = conn.execute(
                f"SELECT alarm_id, node_id, timestamp, alarm_code, severity, message, is_active FROM alarms WHERE node_id IN ({placeholders}) AND is_active = True",
                node_ids
            ).fetchall()
            
            return [
                Alarm(
                    alarm_id=r[0],
                    node_id=r[1],
                    timestamp=r[2],
                    alarm_code=r[3],
                    severity=r[4],
                    message=r[5],
                    is_active=bool(r[6])
                ) for r in rows
            ]

    def save_alarm(self, alarm: Alarm) -> None:
        # Note: DuckDB is opened read-only in the backend for concurrency.
        # Alarm generation is handled by separate scripts.
        raise NotImplementedError("Backend repository is read-only for DuckDB.")
