"""Unit tests for GetActiveAlarmsUseCase."""
import unittest
from unittest.mock import MagicMock
from datetime import datetime, timezone

from src.analytics.get_alarms import GetActiveAlarmsUseCase
from src.shared.repository import IAlarmRepository
from src.shared.graph_engine import GraphEngine
from src.grid.alarm import Alarm

class TestGetActiveAlarmsUseCase(unittest.TestCase):
    def setUp(self):
        # Create mocks for dependencies
        self.mock_repo = MagicMock(spec=IAlarmRepository)
        self.mock_graph = MagicMock(spec=GraphEngine)

        # Default mock graph behavior
        self.mock_graph.find_downstream.return_value = ([], [])

        # Instantiate the use case with mocks
        self.use_case = GetActiveAlarmsUseCase(
            repository=self.mock_repo,
            graph_engine=self.mock_graph
        )

        # Create some sample alarms
        self.alarm1 = Alarm(
            alarm_id="AL-1",
            node_id="NODE-1",
            timestamp=datetime.now(timezone.utc),
            alarm_code="OV_VOLT",
            severity="WARNING",
            is_active=True
        )
        self.alarm2 = Alarm(
            alarm_id="AL-2",
            node_id="NODE-2",
            timestamp=datetime.now(timezone.utc),
            alarm_code="UN_VOLT",
            severity="CRITICAL",
            is_active=True
        )
        self.alarm3 = Alarm(
            alarm_id="AL-3",
            node_id="NODE-3",
            timestamp=datetime.now(timezone.utc),
            alarm_code="COMM_FAIL",
            severity="INFO",
            is_active=True
        )
        self.alarm4 = Alarm(
            alarm_id="AL-4",
            node_id="NODE-1",
            timestamp=datetime.now(timezone.utc),
            alarm_code="TAMPER",
            severity="CRITICAL",
            is_active=True
        )

        # Default mock repo behavior - use side_effect to filter by node_ids
        all_alarms = [self.alarm1, self.alarm2, self.alarm3, self.alarm4]
        self.mock_repo.get_active_alarms_by_nodes.side_effect = lambda node_ids: [
            a for a in all_alarms if a.node_id in node_ids
        ]

    def test_get_alarms_without_downstream(self):
        """Test fetching alarms for a single node without downstream."""
        # Execute
        result = self.use_case.execute(node_id="NODE-1", include_downstream=False)

        # Assertions
        self.mock_graph.find_downstream.assert_not_called()
        self.mock_repo.get_active_alarms_by_nodes.assert_called_once()

        # Should only return alarms for NODE-1
        self.assertEqual(len(result), 2)
        self.assertIn(self.alarm1, result)
        self.assertIn(self.alarm4, result)
        self.assertNotIn(self.alarm2, result)
        self.assertNotIn(self.alarm3, result)

    def test_get_alarms_with_downstream(self):
        """Test fetching alarms with downstream nodes included."""
        # Setup mock graph to return downstream nodes
        self.mock_graph.find_downstream.return_value = (["NODE-2", "NODE-4"], [])

        # Execute
        result = self.use_case.execute(node_id="NODE-1", include_downstream=True)

        # Assertions
        self.mock_graph.find_downstream.assert_called_once_with("NODE-1")
        self.mock_repo.get_active_alarms_by_nodes.assert_called_once()

        # Should return alarms for NODE-1 and NODE-2
        # (NODE-4 has no active alarms in our mock repo)
        self.assertEqual(len(result), 3)
        self.assertIn(self.alarm1, result)
        self.assertIn(self.alarm2, result)
        self.assertIn(self.alarm4, result)
        self.assertNotIn(self.alarm3, result)

    def test_get_alarms_deduplication(self):
        """Test that node IDs are correctly deduplicated."""
        # Setup mock graph to return downstream nodes that include duplicates
        # e.g., if there are multiple paths or graph cycles
        self.mock_graph.find_downstream.return_value = (["NODE-1", "NODE-2", "NODE-2"], [])

        # Execute
        result = self.use_case.execute(node_id="NODE-1", include_downstream=True)

        # The core logic just fetches all active and filters.
        # But we still want to ensure it works properly even with duplicate IDs.
        self.assertEqual(len(result), 3)
        self.assertIn(self.alarm1, result)
        self.assertIn(self.alarm2, result)
        self.assertIn(self.alarm4, result)

    def test_get_alarms_filtering_empty_results(self):
        """Test filtering when no active alarms match target nodes."""
        # Setup mock graph
        self.mock_graph.find_downstream.return_value = (["NODE-4"], [])

        # Execute (no alarms for NODE-99 or NODE-4)
        result = self.use_case.execute(node_id="NODE-99", include_downstream=True)

        # Should return empty list
        self.assertEqual(result, [])

    def test_get_alarms_filtering_repo_empty(self):
        """Test behavior when the repository has no active alarms at all."""
        # Setup mock repo to return empty
        self.mock_repo.get_active_alarms_by_nodes.side_effect = None
        self.mock_repo.get_active_alarms_by_nodes.return_value = []

        # Execute
        result = self.use_case.execute(node_id="NODE-1", include_downstream=True)

        # Should return empty list
        self.assertEqual(result, [])
