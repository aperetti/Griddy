import unittest
import duckdb
import os
import tempfile
from datetime import datetime
from src.shared.alarm_repository import DuckDBAlarmRepository
from src.grid.alarm import Alarm

class TestDuckDBAlarmRepository(unittest.TestCase):
    def setUp(self):
        # Create a temporary DuckDB file
        self.db_fd, self.db_path = tempfile.mkstemp()
        os.close(self.db_fd)
        os.remove(self.db_path) # Delete the empty file so DuckDB can create its own valid database file
        
        # Initialize the schema and data
        with duckdb.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE alarms (
                    alarm_id VARCHAR,
                    node_id VARCHAR,
                    timestamp TIMESTAMP,
                    alarm_code VARCHAR,
                    severity VARCHAR,
                    message VARCHAR,
                    is_active BOOLEAN
                )
            """)
            conn.execute("""
                INSERT INTO alarms VALUES 
                ('AL-1', 'NODE-1', '2025-01-01 10:00:00', 'OV_VOLT', 'WARNING', 'High voltage', True),
                ('AL-2', 'NODE-2', '2025-01-01 11:00:00', 'UV_VOLT', 'CRITICAL', 'Low voltage', True),
                ('AL-3', 'NODE-1', '2025-01-01 12:00:00', 'TAMPER', 'CRITICAL', 'Meter tampered', False)
            """)
            
        self.repo = DuckDBAlarmRepository(self.db_path)

    def tearDown(self):
        if os.path.exists(self.db_path):
            os.remove(self.db_path)

    def test_get_active_alarms_all(self):
        alarms = self.repo.get_active_alarms()
        self.assertEqual(len(alarms), 2)
        # AL-3 is inactive, so it should not be returned
        ids = [a.alarm_id for a in alarms]
        self.assertIn('AL-1', ids)
        self.assertIn('AL-2', ids)
        self.assertNotIn('AL-3', ids)

    def test_get_active_alarms_by_node(self):
        alarms = self.repo.get_active_alarms(node_id='NODE-1')
        self.assertEqual(len(alarms), 1)
        self.assertEqual(alarms[0].alarm_id, 'AL-1')

    def test_get_active_alarms_by_nodes(self):
        alarms = self.repo.get_active_alarms_by_nodes(['NODE-1', 'NODE-2'])
        self.assertEqual(len(alarms), 2)
        ids = [a.alarm_id for a in alarms]
        self.assertIn('AL-1', ids)
        self.assertIn('AL-2', ids)

    def test_get_active_alarms_by_nodes_empty(self):
        alarms = self.repo.get_active_alarms_by_nodes([])
        self.assertEqual(len(alarms), 0)

    def test_save_alarm_not_implemented(self):
        alarm = Alarm(
            alarm_id="AL-NEW",
            node_id="NODE-1",
            timestamp=datetime.now(),
            alarm_code="TEST",
            severity="INFO",
            is_active=True
        )
        with self.assertRaises(NotImplementedError):
            self.repo.save_alarm(alarm)
