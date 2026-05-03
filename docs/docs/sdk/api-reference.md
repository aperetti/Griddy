---
title: SDK API Reference
sidebar_position: 3
---

# SDK API Reference

Initialize the SDK for your plugin using the `get_sdk` factory. The factory reads your plugin's `manifest.json` to determine authorized permissions.

```python
from plugins.sdk import get_sdk

sdk = get_sdk("my_plugin_name")
```

The SDK exposes three namespaced services:

| Namespace | Purpose |
|---|---|
| `sdk.cim` | Query CIM data in Neo4j |
| `sdk.topology` | Traverse the grid topology graph |
| `sdk.analytics` | Run pre-built time-series analytics |

---

## `sdk.cim` — CIM Service

### `run_cypher`

```python
sdk.cim.run_cypher(query: str, params: dict | None = None) -> list[dict]
```

Execute a read-only Cypher query across **all active CIM models**. Results from every loaded feeder are merged into a single flat list.

Raises `ValueError` if the query contains write keywords (`CREATE`, `MERGE`, `SET`, `DELETE`, `REMOVE`, `DROP`).

```python
_CYPHER = """
MATCH (t:PowerTransformer)
WHERE t.`IdentifiedObject.mRID` IN $mrids
RETURN t.`IdentifiedObject.mRID` AS mrid,
       t.`IdentifiedObject.name`  AS name
"""
rows = sdk.cim.run_cypher(_CYPHER, {"mrids": node_ids})
# rows → [{"mrid": "...", "name": "..."}, ...]
```

---

### `get_equipment`

```python
sdk.cim.get_equipment(mrid: str) -> dict | None
```

Return enriched equipment detail for a CIM mRID. Returns `None` if not found.

---

### `get_equipment_expanded`

```python
sdk.cim.get_equipment_expanded(mrid: str) -> dict | None
```

Same as `get_equipment` but with connectivity nodes expanded into the result.

---

### `get_node_details`

```python
sdk.cim.get_node_details(node_id: str) -> dict | None
```

Return CIM details for a connectivity node (bus or junction). Returns `None` if not found.

---

### `get_equipment_by_class`

```python
sdk.cim.get_equipment_by_class(cim_class: str) -> list[dict]
```

Return all equipment of the given CIM class across all active models.

```python
transformers = sdk.cim.get_equipment_by_class("PowerTransformer")
```

---

### `get_schema`

```python
sdk.cim.get_schema() -> dict
```

Return the aggregated CIM schema: `{class_name: {attributes, count}}`. Useful for discovering available equipment classes and their properties.

---

### `search`

```python
sdk.cim.search(query: str, cim_class: str | None = None) -> list[dict]
```

Full-text search across all loaded CIM models. Optionally restrict results to a specific CIM class.

```python
results = sdk.cim.search("Main St Substation", cim_class="Substation")
```

---

## `sdk.topology` — Topology Service

### `get_downstream`

```python
sdk.topology.get_downstream(
    node_id: str,
    max_depth: int | None = None,
) -> tuple[list[str], list[str]]
```

Return `(node_ids, edge_ids)` for all nodes downstream of the given node. Pass `max_depth` to limit traversal depth.

```python
downstream_nodes, downstream_edges = sdk.topology.get_downstream(node_id)
```

---

### `get_upstream`

```python
sdk.topology.get_upstream(node_id: str) -> tuple[list[str], list[str]]
```

Return `(node_ids, edge_ids)` upstream of the given node.

---

### `get_active_model_ids`

```python
sdk.topology.get_active_model_ids() -> list[str]
```

Return the IDs of all currently loaded CIM models.

---

## `sdk.analytics` — Analytics Service

All analytics methods accept ISO 8601 datetime strings for `start_time` / `end_time`.

### `get_consumption`

```python
sdk.analytics.get_consumption(
    node_ids: list[str],
    start_time: str,
    end_time: str,
) -> dict[str, Any]
```

Aggregate consumption time-series for the given nodes. Returns the same response shape as the `/api/plugins/consumption` endpoint.

---

### `get_voltage_distribution`

```python
sdk.analytics.get_voltage_distribution(
    node_ids: list[str],
    start_time: str,
    end_time: str,
    degrees: int | None = None,
) -> dict[str, Any]
```

Voltage distribution (KDE + time-series) for the given nodes. `degrees` controls the polynomial fit order passed to the underlying use case.

---

### `get_voltage_map`

```python
sdk.analytics.get_voltage_map(
    agg: str,
    start_time: str,
    end_time: str,
    start_node_id: str | None = None,
) -> dict[str, Any]
```

Calculate aggregated voltage values for map-wide visualization. `agg` can be `min`, `max`, or `avg`. Returns a mapping of `node_id -> value`.

---

### `get_edge_load_map`

```python
sdk.analytics.get_edge_load_map(
    agg: str,
    start_time: str,
    end_time: str,
    start_node_id: str | None = None,
) -> dict[str, Any]
```

Calculate aggregated edge load for map-wide visualization. Returns a mapping of `edge_id -> value`.

---

### `estimate_consumption`

```python
sdk.analytics.estimate_consumption(
    node_ids: list[str],
    start_time: str,
    end_time: str,
) -> dict[str, Any]
```

Estimate the row count a full `get_consumption` call would return without executing the query. Use this to implement capacity gating before running large queries.

```python
est = sdk.analytics.estimate_consumption(node_ids, start, end)
if est["estimated_rows"] > threshold:
    # warn the user before proceeding
```

---

### `estimate_voltage`

```python
sdk.analytics.estimate_voltage(
    node_ids: list[str],
    start_time: str,
    end_time: str,
    degrees: int | None = None,
) -> dict[str, Any]
```

Same as `estimate_consumption` but for voltage distribution queries.

---

### `estimate_voltage_map`

```python
sdk.analytics.estimate_voltage_map(
    agg: str,
    start_time: str,
    end_time: str,
    start_node_id: str | None = None,
) -> dict[str, Any]
```

Estimate row count for a voltage map query.

---

### `estimate_edge_load_map`

```python
sdk.analytics.estimate_edge_load_map(
    agg: str,
    start_time: str,
    end_time: str,
    start_node_id: str | None = None,
) -> dict[str, Any]
```

Estimate row count for an edge load map query.

---

### `get_phase_balancing`

```python
sdk.analytics.get_phase_balancing(
    node_id: str,
    start_time: str,
    end_time: str,
) -> dict[str, Any]
```

Calculate phase balancing (currents and load) aggregated across all meters downstream of the given `node_id`. Returns medians, peaks, and total energy delivered per phase.

---

## Frontend TypeScript Contracts

### `PluginDefinition`

```typescript
export interface PluginDefinition {
    /** Unique slug — becomes AnalysisInstance.type for windows this plugin owns. */
    type: string;

    /** Categorization for UI placement. */
    category: 'node' | 'system';

    /** Human-readable label shown in toolbar tooltip and minimized tray. */
    label: string;

    /** Lucide icon component (pass the component, not JSX: e.g. `Zap` not `<Zap />`). */
    icon: React.ComponentType<{ size?: number; color?: string }>;

    /** Mantine color name for toolbar button accent. */
    color: string;

    /**
     * Return true if this plugin's toolbar button should be shown for the
     * current selection. Called every time the selection changes.
     * @param nodes Currently selected nodes
     * @param edgeCount Number of currently selected edges
     */
    appliesToNodes: (nodes: Node[], edgeCount?: number) => boolean;

    /**
     * Called when the user clicks the toolbar button.
     * Should create an AnalysisInstance (loading=true), append it to the
     * window list, then fetch data and update the instance when done.
     */
    handleRun: (ctx: PluginExecutionContext) => void;

    /**
     * Render the floating window for an AnalysisInstance whose type matches
     * this plugin's `type` field.  Must return a React element that wraps
     * the shared AnalysisWindow container.
     */
    renderWindow: (instance: AnalysisInstance, callbacks: PluginWindowCallbacks) => ReactNode;
}
```

---

### `PluginExecutionContext`

Available as the `ctx` argument passed to `handleRun`.

| Property | Type | Description |
|---|---|---|
| `selectedNodes` | `Node[]` | Currently selected nodes |
| `selectedEdgeIds` | `string[]` | Currently selected edge IDs |
| `resolveEdgeNodesToNodeIds` | `(edgeIds: string[]) => string[]` | Convert edge IDs to their target node IDs |
| `setAnalysisWindows` | `React.Dispatch<...>` | Replace the full window list |
| `bringWindowToFront` | `(id: string) => void` | Raise a window's z-index |
| `updateWindow` | `(id: string, updates: Partial<AnalysisInstance>) => void` | Patch a window by ID |
| `dateRange` | `{ start: string; end: string }` | Global date range from user settings |
| `systemConfig` | `Record<string, string>` | System config overrides (e.g. `analytics_threshold`) |
| `addHighlightedNodes` | `(ids: string[]) => void` | Additively highlight nodes on the map |
| `addHighlightedEdges` | `(ids: string[]) => void` | Additively highlight edges on the map |
| `setNodeAverages` | `(avgs: Record<string, number> \| null) => void` | Update map-wide node colors (for heatmaps) |
| `setEdgeAverages` | `(avgs: Record<string, number> \| null) => void` | Update map-wide edge colors (for load maps) |
| `setVoltageScale` | `(scale: VoltageScale) => void` | Update the global voltage color scale |
| `selectAndNavigateToNode` | `(id: string \| string[]) => void` | Center map and select node(s) |

---

### `PluginWindowCallbacks`

Passed as the second argument to `renderWindow`.

| Property | Type | Description |
|---|---|---|
| `onClose` | `() => void` | Close and remove the window |
| `onMinimize` | `() => void` | Minimize to the tray |
| `onFocus` | `() => void` | Bring window to front |
| `updateWindow` | `(updates: Partial<AnalysisInstance>) => void` | Pre-bound to the instance ID — update without knowing the ID |
| `setNodeAverages` | `(avgs: Record<string, number> \| null) => void` | Proxy for the context method |
| `setEdgeAverages` | `(avgs: Record<string, number> \| null) => void` | Proxy for the context method |
| `setVoltageScale` | `(scale: any) => void` | Proxy for the context method |
| `selectAndNavigateToNode` | `(id: string \| string[]) => void` | Proxy for the context method |
