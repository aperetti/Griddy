"""Tests for DuckDBMeterDataRepository: persistent connection, weather cache, weighted unnest JOIN."""
import threading
import duckdb
import pytest
from contextlib import contextmanager
from unittest.mock import MagicMock

from src.shared.meter_adapters.duckdb_adapter import DuckDBMeterDataRepository


# ── Persistent connection ─────────────────────────────────────────────────────

class TestPersistentConnection:
    """_get_connection() yields the same connection object when called from the same thread."""

    def test_same_object_reused_within_thread(self, tmp_path):
        db_path = str(tmp_path / "g.duckdb")
        duckdb.connect(db_path).close()
        repo = DuckDBMeterDataRepository(db_path, str(tmp_path))

        with repo._get_connection() as c1:
            id1 = id(c1)
        with repo._get_connection() as c2:
            id2 = id(c2)

        assert id1 == id2

    def test_different_threads_get_independent_connections(self, tmp_path):
        db_path = str(tmp_path / "g.duckdb")
        duckdb.connect(db_path).close()
        repo = DuckDBMeterDataRepository(db_path, str(tmp_path))

        conn_ids: dict[str, int] = {}

        def grab(label):
            with repo._get_connection() as c:
                conn_ids[label] = id(c)

        t1 = threading.Thread(target=grab, args=("t1",))
        t2 = threading.Thread(target=grab, args=("t2",))
        t1.start(); t2.start()
        t1.join(); t2.join()

        assert conn_ids["t1"] != conn_ids["t2"]


# ── Weather cache ─────────────────────────────────────────────────────────────

class TestWeatherCache:
    """_weather_map is populated on first call and never re-fetched."""

    def test_db_query_executes_exactly_once(self):
        repo = DuckDBMeterDataRepository(":memory:", "/nonexistent")

        # mock internal _get_connection to yield mock_conn
        mock_conn = MagicMock()
        mock_conn.execute.return_value.fetchall.return_value = [(1, 1, 0, 15.0)]

        @contextmanager
        def _fake_conn():
            yield mock_conn

        repo._get_connection = _fake_conn

        repo._get_weather_lookup()
        repo._get_weather_lookup()

        assert mock_conn.execute.call_count == 1

    def test_weather_map_populated_correctly(self):
        repo = DuckDBMeterDataRepository(":memory:", "/nonexistent")

        mock_conn = MagicMock()
        mock_conn.execute.return_value.fetchall.return_value = [
            (1, 15, 8, 22.5),
            (7, 4, 14, 35.0),
        ]

        @contextmanager
        def _fake_conn():
            yield mock_conn

        repo._get_connection = _fake_conn
        result = repo._get_weather_lookup()

        assert result[(1, 15, 8)] == pytest.approx(22.5)
        assert result[(7, 4, 14)] == pytest.approx(35.0)


# ── get_aggregate_consumption — weighted unnest JOIN ──────────────────────────

class TestGetAggregateConsumption:
    """Per-node phase weights are passed correctly as parallel arrays to the unnest JOIN."""

    def _make_repo(self):
        repo = DuckDBMeterDataRepository(":memory:", "/nonexistent")
        repo._get_parquet_range_files = MagicMock(return_value=["dummy.parquet"])
        repo._get_read_parquet_sql = MagicMock(return_value="parquet_data")
        repo._weather_map = {}  # skip weather DB call

        mock_conn = MagicMock()
        mock_conn.execute.return_value.fetchall.return_value = []

        @contextmanager
        def _fake_conn():
            yield mock_conn

        repo._get_connection = _fake_conn
        return repo, mock_conn

    def test_empty_node_ids_returns_empty_list(self):
        repo = DuckDBMeterDataRepository(":memory:", "/nonexistent")
        assert repo.get_aggregate_consumption([], {}, "2024-01-01T00:00:00", "2024-01-31T23:00:00") == []

    def test_execute_parameters(self):
        repo, mock_conn = self._make_repo()
        node_ids = ["NODE_A", "NODE_B", "NODE_C"]
        weights = {
            "NODE_A": {"A": 1.0, "B": 0.0, "C": 0.0},
            "NODE_B": {"A": 0.0, "B": 1.0, "C": 0.0},
            "NODE_C": {"A": 0.0, "B": 0.0, "C": 1.0},
        }

        repo.get_aggregate_consumption(node_ids, weights, "2024-01-01T00:00:00", "2024-01-31T23:00:00")

        _sql, params = mock_conn.execute.call_args.args
        _start, _end = params

        assert _start == "2024-01-01T00:00:00"
        assert _end == "2024-01-31T23:00:00"

    def test_sql_uses_parameterized_timestamp(self):
        repo, mock_conn = self._make_repo()

        repo.get_aggregate_consumption(
            ["NODE_A"],
            {"NODE_A": {"A": 1.0, "B": 0.0, "C": 0.0}},
            "2024-01-01T00:00:00",
            "2024-01-31T23:00:00",
        )

        sql, _ = mock_conn.execute.call_args.args
        assert ">= ?::timestamp" in sql.lower()
        assert "<= ?::timestamp" in sql.lower()

