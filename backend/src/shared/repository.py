"""Core repository interface."""
from abc import ABC, abstractmethod
from typing import List, Optional, Any
from src.grid.asset import Asset
from src.grid.meter import Meter
from src.grid.alarm import Alarm

class AssetRepository(ABC):
    """Abstract interface for asset storage."""
    
    @abstractmethod
    def get_asset(self, asset_id: str) -> Optional[Asset]:
        pass

    @abstractmethod
    def save_asset(self, asset: Asset) -> None:
        pass
        
    @abstractmethod
    def get_all_edges(self) -> List[Any]:
        """Returns all edges for graph construction."""
        pass

    @abstractmethod
    def get_active_alarms(self, node_id: Optional[str] = None) -> List[Alarm]:
        """Returns active alarms, optionally filtered by node_id."""
        pass

    @abstractmethod
    def get_active_alarms_by_nodes(self, node_ids: List[str]) -> List[Alarm]:
        """Returns active alarms for a list of node IDs."""
        pass

    @abstractmethod
    def save_alarm(self, alarm: Alarm) -> None:
        """Saves or updates an alarm."""
        pass
