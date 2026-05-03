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

    class SIM simNode
    class DB,AnalyticsDB dbNode
    class App appNode
    class Soda sodaNode
    class Graph,Anal,Alarm,Rules,Views,Alert neutralNode
    class SodaLayer sodaLayerContainer
    ```

    ## Application Architecture Diagram

    This diagram details the technical components and their interactions within the Griddy application stack.

    ```mermaid
    graph TB
    subgraph Client [Frontend - React / TypeScript]
        UI[Mantine UI / Deck.gl]
        State[Topology & Analytics Hooks]
        PluginSDK[Plugin SDK / Registry]
        DisplayEngine[Display Rule Engine]
    end

    subgraph API [Backend - FastAPI / Python]
        Discovery[Discovery & Search]
        Analytics[Analytics Pipelines]
        TopologyAPI[Graph Topology Service]
        RulesAPI[Display Rules CRUD]
        Agent[NL Agent / LLM Bridge]
    end

    subgraph Data [Data Persistence & Processing]
        Neo4j[(Neo4j - CIM Graph)]
        DuckDB[(DuckDB - AMI Readings)]
        SQLite[(SQLite - App Config)]
        Parquet[Parquet - Time-Series Cold Storage]
    end

    UI --> State
    State --> PluginSDK
    PluginSDK --> DisplayEngine

    UI <--> API

    Discovery --> Neo4j
    TopologyAPI --> Neo4j
    Analytics --> DuckDB
    Analytics --> Parquet
    RulesAPI --> SQLite
    Agent --> Neo4j
    Agent --> SQLite

    class UI,State,PluginSDK,DisplayEngine appNode
    class Discovery,Analytics,TopologyAPI,RulesAPI,Agent neutralNode
    class Neo4j,DuckDB,SQLite,Parquet dbNode
    class Client,API,Data sodaLayerContainer
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
