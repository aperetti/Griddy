# Functional Requirements: Grid-Scale Analytical Agent

## 1. Data Architecture & Integration
### 1.1 Grid Model Consumption (The Graph)
* **Connectivity Engine**: Must ingest the grid model and represent it as a directed graph.
* **Hierarchical Relationship**: The system must map the following parent-child relationships: Substation Breaker → Primary Conductors → Fuses/Reclosers → Step-down Transformers → Branch Circuits → Meters (AMI).
* **Phasing Attributes**: Each edge (conductor) and node (device) must carry phasing attributes (A, B, C, or combinations). The graph traversal must be phase-aware to calculate imbalances.

### 1.2 AMI Data Integration
* **Unit of Measure (UOM) Support**: The schema must support:
  * Energy: kWh (Delivered/Received), kVARh (Delivered/Received).
  * Power Quality: Instantaneous Voltage (V), Current (I), and Power Factor (PF).
* **Temporal Alignment**: Ability to aggregate 5-minute, 15-minute, or hourly intervals across thousands of meters simultaneously.

### 1.3 Alarm Data Integration
* **Meter Association**: Alarms must be associated with specific Meter nodes in the graph.
* **Alarm Attributes**: Each alarm record should include a timestamp, alarm code (e.g., 'OV_VOLT', 'UV_VOLT', 'TAMPER'), severity level (Low, Medium, High, Critical), and status (Active/Cleared).
* **Spatial Correlation**: Ability to visualize alarms geospatially to identify cluster failures (e.g., a transformer outage affecting all downstream meters).

## 2. Analytical Agent Capabilities
### 2.1 Graph Navigation & Discovery
* **Downstream Discovery**: Given a Device_ID (e.g., a specific Fuse), the agent must identify all downstream Transformers and their associated Meters.
* **Upstream Tracing**: Identify the specific Breaker or Source feeding a customer point.

### 2.2 Advanced Analytics Functions
* **Voltage Distribution**: Calculate the mean, median, and standard deviation of voltage for all meters downstream of a selected device over a user-defined time range.
* **Phase Balancing**: Aggregate total kWh or instantaneous I across phases A, B, and C at any node in the graph to identify neutral loading or phase imbalance.
* **Aggregation Logic**: The agent must translate natural language (e.g., "What was the peak load on Phase B of Transformer X last Tuesday?") into a SQL query.
* **Data Export**: Support exporting any analysis result to tabular (Excel/CSV) or non-tabular (JSON) formats for external reporting.

## 3. User Interface & Visualization
* **Interactive Graph View**: A map or schematic-based view to select devices for analysis.
  * **Hover Information**: Display key attributes when hovering over nodes (e.g., Name, Type, and for Transformers, their KVA rating).
* **Context Menu**: A right-click context menu on nodes to perform actions such as running downstream analytics or viewing consumption time series.
* **Distribution Histograms**: To visualize the "spread" of voltage across a circuit.
* **Time-Series Charts**: Overlaying multiple meters or aggregated circuit loads to find correlations.
  * Must support filtering by predefined time ranges: Last Week (1W), Last Month (1M), and Last Year (1Y).
  * The consumption view must be split vertically: one graph for total kWh, one for Phase Loading (A, B, C) and Energy Imbalance (|S₂|), and another for Voltage, while maintaining the same total panel height.
  * The Energy Imbalance (|S₂|) must be calculated using symmetrical components based on phase-weighted consumption and plotted on a negative y-axis for visual contrast.

## 4. System Administration & DevOps
### 4.1 System Management Console
* **Reactive Configuration**: Ability to persistently override system configuration settings (e.g., API URLs, data paths) via an integrated SQLite-backed key-value store in a shared volume.
* **Service Hot-Reloading**: The Analytical Backend must monitor the shared configuration and reload settings dynamically without downtime.
* **Data Lifecycle Management**: 
  * Trigger synthetic data generation tasks.
  * Trigger CIM graph ingestion manually.
* **Security**: The Admin Console must operate without direct access to the host's Docker socket, ensuring architectural isolation.
* **Schema Mapping**: Manage and visualize the mapping between CIM classes and the internal graph representation.
