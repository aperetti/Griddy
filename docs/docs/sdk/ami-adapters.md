# Building an AMI Data Adapter

If your meter readings live in an enterprise data lake or a custom database, you can build a custom **AMI Data Adapter** to integrate it with Griddy's analytical engine.

---

## The `IMeterDataRepository` Interface

All meter data access in Griddy is abstracted through the `IMeterDataRepository` interface. To add a new data source, you must create a Python class that implements this interface.

### Required Methods

Your adapter must implement several high-level analytical methods. This "push-down" approach ensures that heavy aggregations (like calculating KDE bins or daily medians) happen directly in the database rather than in the application layer.

```python
class IMeterDataRepository(ABC):
    @abstractmethod
    def get_aggregate_consumption(self, node_ids: list[str], node_weights: dict, start_time: str, end_time: str) -> list[dict]:
        """Return time-series energy consumption aggregated across nodes."""

    @abstractmethod
    def get_voltage_distribution(self, node_ids: list[str], start_time: str, end_time: str) -> dict:
        """Return statistical voltage distribution (bins, heatmap, stability)."""
    
    # ... and other map-wide aggregation methods
```

## Step-by-Step Walkthrough

### 1. Create the Adapter File
Create a new file in `backend/src/shared/meter_adapters/{name}_adapter.py`:

```python
from src.shared.meter_data_repository import IMeterDataRepository

class MyCustomAdapter(IMeterDataRepository):
    name = "my_custom_source"
    label = "My Enterprise Data Lake"

    def __init__(self, connection_string: str):
        # initialize your DB client here
        pass

    # Implement all abstract methods using your DB's query language (SQL, Cypher, etc.)
```

### 2. Automatic Discovery
Griddy automatically scans the `meter_adapters` directory. As soon as you save your file, the adapter will be discovered by the backend.

### 3. Activate in Admin Console
1. Open the **Admin Console** (typically at [http://localhost:8091](http://localhost:8091)).
2. Navigate to the **Configuration** tab.
3. Locate the **AMI Data Source** panel.
4. Select **"My Enterprise Data Lake"** from the dropdown.

## Best Practices

- **Leverage Push-down Compute**: Avoid fetching raw readings. Use your database's built-in aggregation functions (`SUM`, `AVG`, `PERCENTILE_CONT`) to return only the final results needed for the charts.
- **Handle Timezones**: Ensure all timestamps are converted to UTC before returning them to the analytical engine.
- **Prune Large Queries**: Implement the `estimate_*` methods to return an approximate row count. This allows the UI to warn users before they run a multi-year query across thousands of meters.
