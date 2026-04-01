---
title: Release Updates
---
# Release Updates

This page tracks the evolution of the Griddy project. We are currently in **Alpha** (v0.2.4-alpha).

## [0.2.5-alpha] - 2026-03-31
### Added
- **Plugin System**: Introduced a first-class plugin architecture for analytics. Plugins are auto-discovered at startup, gated behind `plugin.<name>.enabled` config overrides, and lazy-loaded in the frontend — disabled plugin JS chunks are never fetched.
- **Admin Plugin Management**: Added a Plugins tab to the Admin Console with live enable/disable toggles. Changes propagate to the backend within ~5 seconds via the existing ConfigWatcher polling loop, no server restart required.
- **Plugin SDK**: Plugins access CIM, topology, and analytics data exclusively through a typed SDK (`PluginCimService`, `PluginTopologyService`, `PluginAnalyticsService`). No direct database connections are permitted in plugin code.
- **Consumption Analysis Plugin**: Time-series energy consumption aggregation for any selected asset and its downstream network, with phase-split (A/B/C) breakdown and weather correlation.
- **Voltage Distribution Plugin**: KDE voltage distribution, scatter heatmap, and daily percentile timeseries for downstream nodes with configurable traversal depth.
- **Transformer Loading Plugin**: On-demand loading detail for selected PowerTransformer nodes.
- **Live Plugin Registry Polling**: The frontend polls `/api/plugins/registry` every 10 seconds and activates newly enabled plugins without a page reload.

### Fixed
- **Analysis Window Positioning**: Floating analysis windows were rendering off-screen because `createPortal` into `document.body` placed them after the 100 vh root element — react-rnd transforms were calculated relative to that offset position. Replaced the portal with a `position: fixed; inset: 0` wrapper so transform coordinates map directly to viewport coordinates.
- **Graph Traversal Lateral Spread**: BFS downstream traversal was permitting movement to nodes at the same flow depth as the current node, causing it to bleed sideways into sibling branches. Fixed by changing the filter from `next_lvl < curr_lvl` to `next_lvl <= curr_lvl`.
- **Config Watcher DB Path**: The ConfigWatcher was defaulting to `admin.sqlite` relative to the backend working directory, while the admin backend wrote to a different path. Both services now resolve the path through `database_setup.ADMIN_SQLITE_PATH`.
- **Plugin Graph Initialization**: Plugin analytics routes now call `ensure_graph_built()` before traversal, matching the pattern used by all other analytics endpoints.

## [0.2.4-alpha] - 2026-03-29 (Commit: ebd567f)
### Added
- **Unified Rule Engine Architecture**: Re-engineered the Cypher query builder to use generic `EXISTS` traversals. This allows for complex property matching across any CIM relationship without requiring pre-defined manual mappings.
- **Rich Contextual Metadata (Tooltips)**: Integrated `tooltip_config` and `tooltip_overrides` into Display Rules. The frontend now receives comprehensive hover data for both nodes and edges.
- **Bulk Classification Cache**: Implemented a model-aware lazy classification cache that dramatically reduces API latency for topology-heavy views.
- **Improved CIM Metadata**: Added `cim_mapping.py` to consolidate display labels, custom units, and scale factors for standardized equipment categorization.

### Changed
- **Async Topology Processing**: Offloaded graph classification logic to a dedicated thread pool using `run_in_threadpool`, ensuring the FastAPI event loop remains responsive during large-scale network queries.
- **Cleaned Up Graph Views**: Reduced clutter in the map view by optimizing default node labels and improving zoom-dependent visibility.

### Fixed
- **Rule Engine Stability**: Resolved a parameter mismatch in the manual VoltageAnalysis module and fixed edge cases in property traversal.

## [0.2.3-alpha] - 2026-03-27 (Commit: c075154)
### Added
- **Analytic Window Pinning**: Users can now "pin" analysis windows to keep them visible while navigating other parts of the grid.
- **Neo4j Graph Database**: Transitioned grid model storage and traversal from SQL-only to Neo4j for highly performant graph queries.
- **Robust Graph Traversal**: Implemented logical flow depth and transformer orientation for more accurate upstream/downstream tracing.
- **Profile Management**: Introduced JSON-based Profile Management for Display Rules, allowing users to switch between complex visualization presets.
- **Multi-Model Reading Generation**: Added support for generating synthetic meter readings across multiple grid models simultaneously.

### Changed
- **Mobile Optimization**: Automatically hide the minimap on viewports ≤768px to prioritize map visibility.
- **UI Refinement**: 
  - Reorganized the Hamburger menu for better clarity and grouping.
  - Refactored `DisplayRulesManager` into logical sections and removed legacy color pickers in favor of profile-based styling.
  - Simplified `GlobalSettingsModal` by removing the Analytics Sidebar and legacy layout modes.

### Removed
- **Analytics Sidebar**: Deprecated the pinned sidebar in favor of a 100% floating window system for all analysis windows.
- **Legacy Layout Modes**: Removed "Grid Sidebar" layout to optimize the geospatial exploration experience.

### Fixed
- **Analytics Window Accessibility**: Improved window layering (zIndex) to ensure new analysis windows always appear on top.
- **CIM Loading**: Resolved a syntax error in the CIM ingestion service and stabilized the Neo4j monitor service.

## [0.2.2-alpha] - 2026-03-23
### Added
- **CIM Equipment Support**: The Rule Builder now supports `target_class` filtering for CIM objects like `EnergyConsumer`, `PowerTransformer`, and `Capacitor`.

### Fixed
- **Display Rule Numeric Coercion**: Fixed a matching failure where numeric rules (e.g., `active_power_w >= 7000`) were treated as strings by the engine.
- **Equipment Type Resolution**: Resolved an inconsistency where the engine failed to match equipment using both `type` and `cim_class` identifiers.

## [0.2.1-alpha] - 2026-03-22
### Added
- **Zoom-Level Rendering**: Grid assets (transformers, meters, fuses) can now be configured to appear/disappear based on the map's zoom level.
- **Rules Manager UX**: Refactored the rules list into a responsive card-based layout for mobile.
- **Rule Builder Visibility**: Introduced a **Resolved JSON** preview in the rule builder to help verify complex condition logic.
- **Interaction Refinement**: Rules list rows and cards are now directly clickable, removing the need for explicit "Edit" buttons.

### Fixed
- **Rules Engine Crash**: Fixed a critical crash when saving or loading rules with empty condition sets.
- **Launch Configuration**: Fixed `launch.json` timeout errors by switching frontend/docs to terminal-based startup.

## [0.2.0-alpha] - 2026-03-15
### Added
- **Admin Console**: Introduced the first version of the Admin Console for managing grid display configurations.
- **Automated Bootstrapping**: Added `ingest_cim_graph.py` and `ingest_weather.py` to automate the initial data setup.
- **Security**: Hardened the backend against SQL injection in the analytics endpoints.

### Changed
- **Performance**: Optimized O(N) entity lookups in the CIM registry to O(1) using hash maps.

## [0.1.0-alpha] - 2026-02-28
### Added
- **Geospatial Engine**: Initial implementation of the MapLibre/Deck.gl visualization layer.
- **Graph Traversal**: Basic upstream/downstream tracing using NetworkX.
- **Core Analytics**: Initial Voltage Distribution and Phase Balance modules.
