---
title: Release Updates
---
# Release Updates

This page tracks the evolution of the Griddy project. We are currently in **Alpha** (v0.2.3-alpha).

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
