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

### 1.4 Grid Entity Search
* **Multi-Entity Search**: The search engine must support finding both Nodes and Edges by name or CIM mRID.
* **Direct Navigation**: Selecting a search result (Node or Edge) must center the map on that entity and highlight it.

### 1.5 Robust Regulator Support
* **FR-CIM-03: Robust Regulator Identification**: The system must robustly identify Step Voltage Regulators across different CIM model variations. This includes identifying `PowerTransformer` entities as regulators if they are associated with `RatioTapChanger` or `StepVoltageRegulator` entities, even if standard hierarchical links (e.g., `TransformerTankEnd`) are missing.
* **FR-CIM-04: Specialized Control Attributes**: For identified regulators, the system must extract and display specialized control parameters from `TapChangerControl` and `RegulatingControl`, including Set Point (`targetValue`), Bandwidth (`targetDeadband`), and Line Drop Compensation settings.

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

### 3.4 Geospatial Clustering
* **Clustering Support**: The system must support grouping overlapping or nearby nodes into clusters based on display rules to maintain map clarity at different zoom levels.
* **Configurable Clustering**: Users can define clustering parameters (Enabled, Radius, Max Zoom, Min Points) in Display Rules.
* **Aggregated Visualization**: Clusters must display the number of nodes they contain and use visual cues (color/icon) derived from the matching rule or a default cluster style.
* **Interactive Drill-down**: Clicking a cluster should either zoom into the extent of children or provide a summary of the contained assets.
* **View Persistence**: The map's viewport (zoom and position) must be preserved during display rule updates to ensure a non-disruptive user experience.

### 3.7 Zoom-Level Rendering
* **Visibility Ranges**: Display rules must support defining a valid zoom range (`min_zoom` to `max_zoom`) for matched assets.
* **Dynamic Hiding**: Assets matching a rule should only be rendered when the current map zoom falls within the specified range.
* **Default Behavior**: If no zoom range is specified, assets should be visible at all levels (unless clustered).

### 3.8 Mobile Responsiveness

* **Minimap Visibility**: To optimize screen real estate on mobile devices, the minimap must be hidden when the viewport width is less than or equal to 768px.

### 3.5 Display Rule Assistant & Diagnostic Explorer
* **Entity Exploration**: Users can select any grid entity to inspect its full CIM attribute set in a dedicated assistant panel.
* **MRID Link Navigation**: The assistant must detect MRIDs in attribute values and provide "dive" buttons to jump to linked entities (e.g., from a Meter to its parent Transformer).
* **Graph Traversal**: Both the Rule Assistant and Diagnostic Explorer must provide a force-directed graph view to visualize and navigate CIM relationships (neighbors).
* **History & Breadcrumbs**: Support backward navigation through the exploration history.
* **Attribute Actions**: A context menu on attributes allows users to quickly add conditions to the current rule (Rule Assistant) or view historical trends (Diagnostic Explorer).
* **Semantic Path Generation**: Hierarchical paths use lowercase CIM class names (e.g., `transformertank.0.ratedS`) for alignment with graph traversal.

### 3.6 Advanced Condition Logic
* **Nested Groups**: Support for multi-level nested condition groups using AND/OR logical operators.
* **Visual Hierarchy**: The rule builder must visually represent group nesting and provide controls (Add Group/Condition) at each level.
* **Boolean Evaluation**: The system must correctly evaluate complex logical expressions across both node attributes and attached equipment properties.

### 3.10 Display Rule Management
(Includes Advanced Filtering Engine)

*Basic Authentication:* The rule management interface and configuration APIs are protected by HTTP Basic Authentication. Users sign in using secure PBKDF2 hashed credentials stored in the centralized configuration database. Administrators can manage these accounts seamlessly via the Admin Console UI or Docker CLI tools.

Users can create conditional formatting rules based on any attribute of a grid entity (e.g., "Show all transformers with KVA > 500").
* **Rule Toggling**: Users can enable/disable individual display rules via a toggle switch in the Rule Manager to quickly test different visualization configurations without deleting rules.
- **FR-DR-08: Duplicate Rule** - User can duplicate an existing rule to iterate on it.
- **FR-DR-09: Rename Profile** - User can rename an existing display rule profile.
- **FR-DR-10: Confirmation Modals** - User is prompted with custom modals (not native browser dialogs) before destructive actions.
- **FR-DR-11: Display Profiles** - Support for multiple independent display configurations (profiles).
- **FR-DR-12: Import/Export** - Ability to export and import display profiles as JSON files.
- **FR-DR-13: SVG Overrides** - Define rule-specific SVG element modifications (visibility, color, transforms) via a live editor.
- **FR-DR-14: Advanced Rule Organization** - Group rules by CIM Class and sort by Priority or Name in the manager.

## 3.12 Plugin System
* **Extensible Analysis Screens**: The application must support a plugin architecture that allows new analysis screens to be added without modifying the core codebase.
* **Toolbar Integration**: Plugins register toolbar buttons that appear only when they apply to the current node/edge selection.
* **Floating Windows**: Each plugin renders its results in a draggable, minimizable floating analysis window, consistent with existing analysis screens.
* **Built-in Plugins**: The system ships with four reference plugins:
  * **Consumption Analysis**: Aggregate energy consumption time-series for downstream nodes over a user-defined date range.
  * **Voltage Distribution**: Voltage KDE, scatter plot, and time-series for downstream nodes with configurable polynomial degree.
  * **Transformer Loading**: CIM transformer end data (rated S/kVA, rated U/V) for transformers at or downstream of the selected node.
  * **Network Load Heatmap**: Visualize aggregated edge loading across the grid topology from a selected source or substation.
* **Capacity Gating**: Consumption and voltage plugins must provide an estimate endpoint to warn users before executing large queries.
* **Downstream Highlighting**: After an analysis runs, the downstream nodes and edges involved must be additively highlighted on the map.

## 4. System Administration & DevOps
### 4.1 System Management Console
* **Reactive Configuration**: Ability to persistently override system configuration settings (e.g., API URLs, data paths) via an integrated SQLite-backed key-value store in a shared volume.
* **Service Hot-Reloading**: The Analytical Backend must monitor the shared configuration and reload settings dynamically without downtime.
* **Data Lifecycle Management**: 
  * **Complete Data Refresh**: The system must provide a mechanism to completely wipe all database files (DuckDB, SQLite topology, and Parquet data) and trigger a clean data generation process within the Docker environment.
  * **Trigger Synthetic Generation**: Trigger synthetic data generation tasks.
  * **Trigger CIM Ingestion**: Trigger CIM graph ingestion manually.
* **Security**: The Admin Console must operate without direct access to the host's Docker socket, ensuring architectural isolation.
* **Schema Mapping**: Manage and visualize the mapping between CIM classes and the internal graph representation.

### 3.11 Visibility Settings Abstraction
* **SVG Element Extraction**: The system must automatically parse uploaded SVG icons and identify unique element IDs (e.g., `#breaker-open`, `#status-ok`).
* **Conditional Visibility Mapping**: Users can define a mapping between CIM conditions and the visibility of specific SVG elements without writing manual CSS.
* **Reusable Visibility Profiles**: Support for creating visibility profiles that can be applied to any rule using compatible SVG icons.
* **Dynamic Icon Variants**: The system must support rendering multiple "states" of a single SVG icon in the sprite atlas (e.g., an open vs. closed state for a single breaker rule).

### 3.13 Diagnostic Explorer
* **Relationship Discovery**: Provides a standalone graph view to explore neighbors of any grid entity without building a display rule.
* **Attribute Inspection**: Display a side panel with the selected node's full CIM attribute set.
* **Edge Exploration**: Users can select edges in the graph to view relationship types and any edge-specific attributes.
* **Search Integration**: Users can start a diagnostic session by searching for an entity by name or mRID.
* **Contextual Launch**: Right-clicking an asset on the map or in another analysis screen allows launching the Diagnostic Explorer focused on that entity.
* **PC Layout Optimization**: When viewed on a PC (non-mobile viewport), the GraphExplorer must use a side-by-side layout with the attribute table as a right-hand sidebar to optimize screen real estate and maximize the graph canvas area.
