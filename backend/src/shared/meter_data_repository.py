from abc import ABC, abstractmethod
from typing import Dict, List, Optional, TypedDict

class EstimateResult(TypedDict):
    """Result of an estimation query."""
    estimated_rows: int

class ConsumptionTimeseriesPoint(TypedDict):
    """A single point in a consumption timeseries."""
    timestamp: str
    kwh_delivered: float
    kwh_received: float
    kwh_a: float
    kwh_b: float
    kwh_c: float
    temperature: Optional[float]

class VoltageDistributionPoint(TypedDict):
    """A single KDE/bin point for voltage distribution."""
    voltage: float
    phase_a: int
    phase_b: int
    phase_c: int

class VoltageScatterPoint(TypedDict):
    """A point for the voltage vs. loading scatter plot (heatmap)."""
    loading: float
    voltage: float
    count: int

class VoltageTimeseriesPoint(TypedDict):
    """A daily/hourly percentile reading for voltage stability."""
    date: str
    p10: float
    p50: float
    p90: float

class VoltageDistributionResult(TypedDict, total=False):
    """Contains distribution, scatter, and timeseries data for voltage analytics."""
    distribution: List[VoltageDistributionPoint]
    scatter: List[VoltageScatterPoint]
    timeseries: List[VoltageTimeseriesPoint]

class MapAggregationPoint(TypedDict):
    """Aggregated metric (e.g., average voltage or sum load) for a single node on the map."""
    node_id: str
    value: float

class PhaseBalancingPoint(TypedDict):
    """A single point in time showing currents and load across phases."""
    timestamp: str
    current_a: float
    current_b: float
    current_c: float
    kwh: float

class PhaseBalancingResult(TypedDict, total=False):
    """Result container for phase balancing."""
    results: List[PhaseBalancingPoint]


class IMeterDataRepository(ABC):
    """
    Interface for reading meter data and performing high-level analytics.
    Implementations of this interface (like DuckDB, Snowflake, Databricks, PostgreSQL adapters)
    should perform the aggregations and grouping 'push-down' whenever possible.
    """

    @abstractmethod
    def estimate_aggregate_consumption(self, node_ids: List[str], start_time: str, end_time: str) -> EstimateResult:
        """Estimate the number of rows for a consumption query."""
        pass

    @abstractmethod
    def get_aggregate_consumption(self, node_ids: List[str], node_weights: Dict[str, Dict[str, float]], start_time: str, end_time: str) -> List[ConsumptionTimeseriesPoint]:
        """Fetch aggregated consumption timeseries joined with weather."""
        pass

    @abstractmethod
    def estimate_voltage_distribution(self, node_ids: List[str], start_time: str, end_time: str) -> EstimateResult:
        """Estimate the number of rows for a voltage query."""
        pass

    @abstractmethod
    def get_voltage_distribution(self, node_ids: List[str], start_time: str, end_time: str) -> VoltageDistributionResult:
        """Fetch voltage distribution (bins, heatmap, stability)."""
        pass

    @abstractmethod
    def estimate_map_voltage(self, start_time: str, end_time: str, agg: str, node_filter: Optional[List[str]] = None) -> EstimateResult:
        """Estimate the number of rows for a map-wide voltage query."""
        pass

    @abstractmethod
    def get_map_voltage(self, start_time: str, end_time: str, agg: str, node_filter: Optional[List[str]] = None) -> List[MapAggregationPoint]:
        """Fetch aggregated voltage for map visualization."""
        pass

    @abstractmethod
    def estimate_map_edge_load(self, start_time: str, end_time: str, agg: str, node_filter: Optional[List[str]] = None) -> EstimateResult:
        """Estimate the number of rows for a map-wide edge load query."""
        pass

    @abstractmethod
    def get_map_edge_load(self, start_time: str, end_time: str, agg: str, node_filter: Optional[List[str]] = None) -> List[MapAggregationPoint]:
        """Fetch aggregated edge load for map visualization."""
        pass

    @abstractmethod
    def get_phase_balancing(self, node_ids: List[str], start_time: str, end_time: str) -> PhaseBalancingResult:
        """Fetch phase balancing analytics for a set of nodes."""
        pass
