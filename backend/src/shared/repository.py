"""Core repository interfaces."""
from abc import ABC, abstractmethod
from typing import List, Optional
from src.grid.alarm import Alarm


class IAlarmRepository(ABC):
    """Abstract interface for alarm storage."""

    @abstractmethod
    def get_active_alarms(self, node_id: Optional[str] = None) -> List[Alarm]:
        """Returns active alarms, optionally filtered by node_id."""

    @abstractmethod
    def get_active_alarms_by_nodes(self, node_ids: List[str]) -> List[Alarm]:
        """Returns active alarms for a list of node IDs."""

    @abstractmethod
    def save_alarm(self, alarm: Alarm) -> None:
        """Saves or updates an alarm."""
