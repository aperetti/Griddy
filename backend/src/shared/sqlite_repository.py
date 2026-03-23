"""SQLite repository implementation for grid topology.

Replaces DuckDBRepository for topology queries (grid_nodes, grid_edges, alarms).
DuckDB is retained only as the analytics engine for parquet/weather queries.
"""
import sqlite3
import json
from typing import List, Optional
from src.shared.repository import AssetRepository
from src.grid.asset import Asset, Edge
from src.grid.alarm import Alarm


class SqliteRepository(AssetRepository):
    """SQLite implementation of the Asset Repository."""

    def __init__(self, db_path: str):
        self.db_path = db_path

    # ── helpers ────────────────────────────────────────────────────

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    @staticmethod
    def _parse_phases(val) -> list:
        """Parse phases from JSON string, list, or comma-sep."""
        if val is None:
            return ['A', 'B', 'C']
        if isinstance(val, list):
            return val
        try:
            parsed = json.loads(val)
            return parsed if isinstance(parsed, list) else ['A', 'B', 'C']
        except (json.JSONDecodeError, TypeError):
            return ['A', 'B', 'C']

    # ── AssetRepository implementation ─────────────────────────────

    def get_asset(self, asset_id: str) -> Optional[Asset]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT node_id, node_type, name, phases_present "
                "FROM grid_nodes WHERE node_id = ?",
                (asset_id,)
            ).fetchone()
            if row:
                return Asset(
                    id=row['node_id'],
                    asset_type=row['node_type'],
                    name=row['name'],
                    phases_present=self._parse_phases(row['phases_present']),
                )
        return None

    def save_asset(self, asset: Asset) -> None:
        phases_json = json.dumps(asset.phases_present) if asset.phases_present else '["A","B","C"]'
        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO grid_nodes "
                "(node_id, node_type, name, phases_present) VALUES (?, ?, ?, ?)",
                (asset.id, asset.asset_type, asset.name, phases_json),
            )
            conn.commit()

    def save_edge(self, edge: Edge) -> None:
        phases_json = json.dumps(edge.phases) if edge.phases else '["A","B","C"]'
        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO grid_edges "
                "(edge_id, from_node_id, to_node_id, conductor_type, phases) "
                "VALUES (?, ?, ?, ?, ?)",
                (edge.id, edge.from_node_id, edge.to_node_id,
                 edge.conductor_type, phases_json),
            )
            conn.commit()

    def get_all_edges(self) -> List[dict]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT edge_id, from_node_id, to_node_id, phases FROM grid_edges"
            ).fetchall()
            return [
                {
                    "edge_id": r['edge_id'],
                    "from_node_id": r['from_node_id'],
                    "to_node_id": r['to_node_id'],
                    "phases": self._parse_phases(r['phases']),
                }
                for r in rows
            ]

    def get_all_nodes_with_coordinates(self) -> List[dict]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT node_id, node_type, name, latitude, longitude, "
                "is_open, phases_present FROM grid_nodes"
            ).fetchall()
            return [
                {
                    "node_id": r['node_id'],
                    "node_type": r['node_type'],
                    "name": r['name'],
                    "latitude": r['latitude'],
                    "longitude": r['longitude'],
                    "is_open": bool(r['is_open']),
                    "phases_present": self._parse_phases(r['phases_present']),
                }
                for r in rows
            ]

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
            return [
                Alarm(
                    alarm_id=r['alarm_id'],
                    node_id=r['node_id'],
                    timestamp=r['timestamp'],
                    alarm_code=r['alarm_code'],
                    severity=r['severity'],
                    message=r['message'],
                    is_active=bool(r['is_active']),
                )
                for r in rows
            ]

    def get_active_alarms_by_nodes(self, node_ids: List[str]) -> List[Alarm]:
        if not node_ids:
            return []

        with self._connect() as conn:
            placeholders = ','.join(['?'] * len(node_ids))
            query = f"""
                SELECT alarm_id, node_id, timestamp, alarm_code,
                severity, message, is_active
                FROM alarms WHERE is_active = 1 AND node_id IN ({placeholders})
            """
            rows = conn.execute(query, node_ids).fetchall()
            return [
                Alarm(
                    alarm_id=r['alarm_id'],
                    node_id=r['node_id'],
                    timestamp=r['timestamp'],
                    alarm_code=r['alarm_code'],
                    severity=r['severity'],
                    message=r['message'],
                    is_active=bool(r['is_active']),
                )
                for r in rows
            ]

    def save_alarm(self, alarm: Alarm) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO alarms "
                "(alarm_id, node_id, timestamp, alarm_code, severity, message, is_active) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (alarm.alarm_id, alarm.node_id, alarm.timestamp,
                 alarm.alarm_code, alarm.severity, alarm.message,
                 int(alarm.is_active)),
            )
            conn.commit()
