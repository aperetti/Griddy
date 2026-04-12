"""SQLite implementation of IAlarmRepository.

Alarms are operational events that reference CIM node mRIDs.  They live in
admin.sqlite alongside display-rule configuration so that a single SQLite
file covers all non-Neo4j state.
"""
import sqlite3
from typing import List, Optional
from src.shared.repository import IAlarmRepository
from src.grid.alarm import Alarm


class AlarmRepository(IAlarmRepository):
    """SQLite-backed alarm repository."""

    def __init__(self, db_path: str):
        self.db_path = db_path

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    def get_active_alarms(self, node_id: Optional[str] = None) -> List[Alarm]:
        with self._connect() as conn:
            query = (
                "SELECT alarm_id, node_id, timestamp, alarm_code, "
                "severity, message, is_active "
                "FROM alarms WHERE is_active = 1"
            )
            params: list = []
            if node_id:
                query += " AND node_id = ?"
                params.append(node_id)
            rows = conn.execute(query, params).fetchall()
            return [self._row_to_alarm(r) for r in rows]

    def get_active_alarms_by_nodes(self, node_ids: List[str]) -> List[Alarm]:
        if not node_ids:
            return []
        with self._connect() as conn:
            placeholders = ",".join(["?"] * len(node_ids))
            query = (
                f"SELECT alarm_id, node_id, timestamp, alarm_code, "
                f"severity, message, is_active "
                f"FROM alarms WHERE is_active = 1 AND node_id IN ({placeholders})"
            )
            rows = conn.execute(query, node_ids).fetchall()
            return [self._row_to_alarm(r) for r in rows]

    def save_alarm(self, alarm: Alarm) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO alarms "
                "(alarm_id, node_id, timestamp, alarm_code, severity, message, is_active) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    alarm.alarm_id,
                    alarm.node_id,
                    alarm.timestamp,
                    alarm.alarm_code,
                    alarm.severity,
                    alarm.message,
                    int(alarm.is_active),
                ),
            )
            conn.commit()

    @staticmethod
    def _row_to_alarm(r: sqlite3.Row) -> Alarm:
        return Alarm(
            alarm_id=r["alarm_id"],
            node_id=r["node_id"],
            timestamp=r["timestamp"],
            alarm_code=r["alarm_code"],
            severity=r["severity"],
            message=r["message"],
            is_active=bool(r["is_active"]),
        )
