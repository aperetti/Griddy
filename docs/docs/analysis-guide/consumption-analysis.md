---
sidebar_position: 1
---

# Consumption Time Series

The Consumption Time Series analysis provides a comprehensive view of energy delivery patterns for a selected asset and its downstream network. It helps engineers and planners understand **how much energy** is flowing, **when** peak demand occurs, and **how weather** influences loading.

## Opening the Analysis

1. Click a node on the map to select it.
2. Click the **bar chart icon** (📊) in the analytics toolbar.
3. The analysis window opens and queries downstream meter readings for the selected date range.

## Understanding the Charts

![Consumption analysis window showing net and generation data](/img/features/consumption-chart.png)

The window contains three charts, each providing a different analytical perspective:

---

### 1. Consumption Time-Series (Full Period)

**What it shows:** Daily aggregate energy delivery (kWh) across the selected time range, overlaid with a 24-hour rolling average ambient temperature curve.

**How to read it:**
- **Blue bars/lines** represent the total kWh delivered (*Delivered*) each interval (typically daily).
- **Green lines** (when present) represent energy received from distributed generation (*Received*).
- **Orange dash/line** represents the **Net Consumption** (Delivered - Received).
- **Red line** shows the ambient temperature (°C) on the right Y-axis.
- A **zoom slider** at the bottom lets you focus on any sub-range without re-querying.

### Bidirectional Flow & Generation
This chart supports bidirectional energy flow analysis. For assets connected to distributed energy resources (DER) or microturbines, the chart will automatically visualize the interplay between grid supply and local generation.
- **High "Received" values**: Indicate periods of significant local generation (solar, wind, turbines).
- **Negative "Net" values**: Occur when local generation exceeds local load, resulting in backfeeding into the upstream grid.

**Value it provides:**
- Spot **demand spikes** that may indicate equipment stress or new large loads
- Correlate consumption **increases with cold snaps** (heating load) or **heat waves** (cooling load)
- Identify **unusual drops** that could signal outages, meter failures, or switching events
- Detect **seasonal trends** to forecast future capacity needs

---

### 2. Typical Daily Load Profile (Hourly Avg)

**What it shows:** The average hourly consumption pattern across all days in the selected range.

**How to read it:**
- The **orange curve** represents the mean kWh consumption for each hour of the day (0:00 – 23:00)
- The X-axis is hour-of-day; the Y-axis is average kWh

**Value it provides:**
- Reveals the **diurnal pattern** — when the network is most and least loaded
- Identifies **morning ramp-up** and **evening peak** demand windows
- Helps utilities schedule **maintenance windows** during low-demand periods
- Useful for sizing **battery storage** or **demand response programs** by understanding off-peak surplus

---

### 3. Load vs Temperature Correlation (Scatter)

**What it shows:** A scatter plot of consumption vs. ambient temperature, with seasonal target markers.

**How to read it:**
- Each **blue dot** represents a single time interval's kWh delivery plotted against temperature
- **Winter Target** (left marker, e.g., −5°C) and **Summer Target** (right marker, e.g., 30°C) show labeled design-day references
- The shape of the scatter reveals the **heating/cooling sensitivity** of the circuit

**Value it provides:**
- Quantifies how **temperature-sensitive** a circuit is — steeper slopes mean more weather-dependent load
- Helps identify the **balance point** temperature where heating/cooling loads are minimal
- Enables **design-day forecasting** — extrapolate what consumption would be at extreme temperatures
- Detects **anomalous outliers** — points far from the main cluster may indicate data quality issues or unusual events

## Filters

Click the **Filters** button in the title bar to adjust:
- **Degrees of Separation** — controls how many hops downstream from the selected node are included in the query
- **Date Range** — use the quick-select buttons (1W, 1M, 1Y) or configure globally in settings

## Tips

- **Large queries**: When the estimated row count exceeds the threshold, the window will pause and ask for confirmation before proceeding
- **Multi-asset aggregate**: Select multiple nodes (Shift+Click) to see aggregated consumption across assets
- **Drag & resize**: Position the window anywhere on screen; it remembers its last position
