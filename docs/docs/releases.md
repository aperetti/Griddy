---
title: Release Updates
---
# Release Updates

This page tracks the evolution of the Griddy project. We are currently in **Alpha** (v0.2.2-alpha).

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
