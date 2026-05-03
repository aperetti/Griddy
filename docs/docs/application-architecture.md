# Application Architecture

This document details the technical components and their interactions within the Griddy application stack.

## Technical Components Diagram

```mermaid
graph TD
    subgraph Client [Main Frontend - React]
        UI[Mantine UI / Deck.gl]
        State[Topology & Analytics Hooks]
        PluginSDK[Plugin SDK / Registry]
        DisplayEngine[Display Rule Engine]

        UI --> State
        State --> PluginSDK
        PluginSDK --> DisplayEngine
    end

    subgraph AdminConsole [Admin Console - React/Node]
        AdminUI[Admin Frontend]
        RuleEditor[Display Rule Editor]
        AdminServer[Admin Backend - Fastify]

        AdminUI --> RuleEditor
        RuleEditor <--> AdminServer
    end

    subgraph API [Main Backend - FastAPI]
        Discovery[Discovery & Search]
        TopologyAPI[Graph Topology Service]
        Analytics[Analytics Pipelines]
        RulesAPI[Display Rules API]
    end

    subgraph Data [Persistence & Processing]
        Neo4j[(Neo4j - CIM Graph)]
        DuckDB[(DuckDB - AMI Readings)]
        RulesDB[(SQLite - Display Rules)]
        AdminDB[(SQLite - Admin Config & Users)]
        Parquet[Parquet - Time-Series Cold Storage]
    end

    UI <--> Discovery
    UI <--> TopologyAPI
    UI <--> Analytics
    UI <--> RulesAPI

    AdminServer <--> API

    Discovery --> Neo4j
    TopologyAPI --> Neo4j
    Analytics --> DuckDB
    Analytics --> Parquet
    RulesAPI --> RulesDB
    AdminServer --> RulesDB
    AdminServer --> AdminDB
    
    %% Main Backend accesses config/users in RO mode
    API -.-> AdminDB

    class UI,State,PluginSDK,DisplayEngine,AdminUI,RuleEditor appNode
    class AdminServer,Discovery,Analytics,TopologyAPI,RulesAPI neutralNode
    class Neo4j,DuckDB,RulesDB,AdminDB,Parquet dbNode
    class Client,AdminConsole,API,Data sodaLayerContainer
    ```

    ## Shared State & Persistence

    To enhance security and maintain a clean separation of concerns, the system configuration is split across two distinct SQLite databases. This allows the Main Backend to operate with **least-privilege access**, connecting to these databases in a strictly read-only mode.

    ### Data Isolation Matrix

    | Storage | Component / Table | Main Backend (FastAPI) | Admin Backend (Fastify) |
    | :--- | :--- | :---: | :---: |
    | **Rules DB** | `display_configs`, `display_rules` | **READ (RO)** | READ/WRITE |
    | **Admin DB** | `config_overrides`, `users` | **READ (RO)** | READ/WRITE |
    | **Topology DB** | Pre-processed Grid Structure | READ/WRITE | - |

    ### Persistence Roles
    *   **Rules DB (`rules.sqlite`):** Dedicated to the "Display Rule Editor". It stores profiles and styling logic. By isolating this, we ensure that changes to visualization rules cannot accidentally corrupt user accounts or system-level configuration.
    *   **Admin DB (`admin.sqlite`):** Stores sensitive administrative data, including hashed user credentials and system-wide overrides (e.g., `analytics_threshold`). The Main Backend reads this for authentication and dynamic settings but has no permission to modify it.
    *   **Neo4j:** Stores the full CIM Property Graph, used for complex topology traversals and relationship discovery.
    *   **DuckDB:** An embedded OLAP database used for high-speed aggregation of time-series AMI readings stored in Parquet format.

    :::info Work in Progress
    This architecture diagram is currently being refined to more accurately reflect the system's organization and technical boundaries.
    :::

