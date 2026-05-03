# Architectural Overview

This document provides a high-level overview of the Griddy architectural data flow and system components.

## System Architecture Diagram

```mermaid
graph TD
    SIM[SIM Model] --> DB[(Grid Database)]
    DB --> Graph[SIM Graph Engine]
    Graph --> App[Main Application]
    App --> AnalyticsDB[(Analytics Results Database)]
    App --> Soda[Soda Display Layer]

    subgraph SodaLayer [Soda Display Layer Components]
        Soda --> Anal[Analytics Pipeline]
        Soda --> Alarm[Alarming System]
        Soda --> Rules[Display & Alert Rules Engine]
        Rules --> Views[Dynamic Visualizations]
        Rules --> Alert[System Alerts]
    end

    style SIM fill:var(--mermaid-sim-fill),stroke:var(--mermaid-node-stroke),color:var(--mermaid-node-color)
    style DB fill:var(--mermaid-db-fill),stroke:var(--mermaid-node-stroke),color:var(--mermaid-node-color)
    style AnalyticsDB fill:var(--mermaid-db-fill),stroke:var(--mermaid-node-stroke),color:var(--mermaid-node-color)
    style App fill:var(--mermaid-app-fill),stroke:var(--mermaid-node-stroke),color:var(--mermaid-node-color)
    style Soda fill:var(--mermaid-soda-fill),stroke:var(--mermaid-node-stroke),color:var(--mermaid-node-color)
    style Graph fill:var(--mermaid-neutral-fill),stroke:var(--mermaid-node-stroke),color:var(--mermaid-node-color)
    style Anal fill:var(--mermaid-neutral-fill),stroke:var(--mermaid-node-stroke),color:var(--mermaid-node-color)
    style Alarm fill:var(--mermaid-neutral-fill),stroke:var(--mermaid-node-stroke),color:var(--mermaid-node-color)
    style Rules fill:var(--mermaid-neutral-fill),stroke:var(--mermaid-node-stroke),color:var(--mermaid-node-color)
    style Views fill:var(--mermaid-neutral-fill),stroke:var(--mermaid-node-stroke),color:var(--mermaid-node-color)
    style Alert fill:var(--mermaid-neutral-fill),stroke:var(--mermaid-node-stroke),color:var(--mermaid-node-color)
    style SodaLayer fill:rgba(0,0,0,0.05),stroke:var(--mermaid-node-stroke),stroke-dasharray: 5 5
```
## Data Flow Description

1.  **SIM Model:** The source of truth for the power system topology and properties.
2.  **Grid Database:** Stores the persistent state of the grid model (Neo4j for graph, SQLite for configuration).
3.  **AMI Data Adapters (IMeterDataRepository):** A pluggable abstraction layer for retrieving time-series meter readings. Adapters allow Griddy to query diverse data sources:
    *   **DuckDB (Default):** Local Parquet-backed storage for high-performance edge analytics.
    *   **Cloud Data Lakes:** Custom adapters for Snowflake, Databricks, BigQuery, etc.
4.  **SIM Graph Engine:** Processes topology data into a high-performance Property Graph for traversal and analysis.
5.  **Main Application:** The core logic server that orchestrates data access, user interactions, and system services.
6.  **Analytics Results Database:** A dedicated storage layer for processed data, trends, and analytical findings.
7.  **Soda Display Layer:** The presentation and real-time monitoring interface, including:
    *   **Analytics Pipeline:** On-the-fly data processing for visualization.
    *   **Alarming System:** Monitors thresholds and triggers system-wide alarms.
    *   **Rules Engine:** Dynamically calculates how grid objects are rendered based on user-defined logic.
