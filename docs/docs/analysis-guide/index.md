# Grid Analysis Guide

This guide explains how to interact with the interactive grid map and use Griddy's analytical tools to explore energy consumption and voltage behavior across your distribution network.

## Selecting an Asset

Click on any node on the map to select it. Selected nodes turn **blue** and highlight their connected network. The **Analytics Toolbar** appears in the top-right corner showing the selected asset count, date range, and two analysis icons.

![Node selected on the grid map with the analytics toolbar visible](/img/guide/grid-map-node-selected.png)

The toolbar provides:
- **Asset count badge** — shows how many nodes are selected (multi-select with Shift+Click)
- **Date range** — the time window used for all analyses (configurable via the settings panel)
- **Consumption icon** (bar chart) — opens the Consumption Time Series analysis
- **Voltage icon** (√x) — opens the Voltage Distribution analysis
- **Diagnostic icon** (🗄️) — opens the CIM Diagnostic View & Topology Explorer
- **Clear selection** (✕) — deselects all nodes

## Available Analysis Types

1. [**Consumption Time Series**](./consumption-analysis) — Energy delivery patterns, daily load profiles, and weather correlation
2. [**Voltage Distribution**](./voltage-analysis) — Statistical voltage behavior, daily stability trends, and load-voltage relationships
3. [**Voltage Map (Heatmap)**](./voltage-map) — System-wide visualization of voltage health across the network
4. [**Diagnostic View**](./diagnostic-view) — CIM attribute explorer and Neighborhood Topology tree
5. [**Data Export**](./data-export) — Direct download of analytical data in CSV or JSON formats

## Multi-Window Support

Multiple analysis windows can be open **simultaneously**. Open a consumption analysis for one transformer, then select a different asset and open its voltage analysis — both windows remain independent.

Each window can be:
- **Dragged** by its title bar to any position on screen
- **Resized** from any edge or corner
- **Minimized** to a tab at the bottom of the screen
- **Closed** without affecting other open windows

Minimized windows retain all their data and context, even after you click away and deselect the original node on the map.

![Two analysis windows open simultaneously — consumption minimized as a tab while voltage is active](/img/guide/multi-window.png)

## Degrees of Separation

Most analysis types allow you to specify **Degrees of Separation** via the Filters menu. This controls how "deep" the search goes from the selected node:
- **0 Degrees**: Only analyzes the selected node.
- **5 Degrees (Default)**: Analyzes the node and its neighbors up to 5 steps away.
- **Full Trace (null)**: Analyzes the entire downstream tree from the selected point.
