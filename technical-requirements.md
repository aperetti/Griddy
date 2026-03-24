# Technical Requirements: Grid-Scale Analytical Agent

## 1. Architecture & Design
* **Architecture**: Organize code by feature (vertical slices) rather than technical layers. A single file NEVER handles more than one responsibility.
* **Responsiveness**: All overlays and analytical windows must support mobile viewports (minimum 320px width) without horizontal scrolling. Draggable/resizable windows must be clamped to the viewport bounds.
* **File Structure**: Must propose a file structure following Vertical Slice Architecture before writing any code.

## 2. Infrastructure & Data Storage
* **Database**: DuckDB must be used as the database, overriding global rule #4. Time-series and cold data should use Parquet format.
* **Grid Model Graph**: Python with NetworkX (or similar).

## 3. Interactive Visual Grid
*   **Visualization (Frontend)**:
    *   **Library:** Deck.gl for rendering the interactive grid topology map using geospatial coordinates.
    *   **Features:** Interactive node clicking, context menu (right-click) for node-specific actions, geospatial zooming, panning.
    *   **Data Fetching:** Standard `fetch` API against FastAPI REST endpoints.
    *   **Rendering Taxonomy:** Switches must be rendered as squares. Open switches should be transparent/hollow; closed switches must be filled.
    *   **Clustering**: The frontend must implement geospatial clustering (e.g. using `supercluster`) to aggregate overlapping or nearby nodes based on rules. This replaces the legacy radial de-confliction mechanism.
    *   **View Persistence**: The `GridMap` must support a `skipGlobalFit` mechanism to suppress automatic zoom-to-extent transitions during state-only refreshes (like display rule updates).
    *   **Rule Assistant Integration**:
        *   Implement a side-by-side layout (50/50 split on desktop) between the Rule Assistant and Rule Builder.
        *   The Assistant must use `lucide-react` icons and Mantine components (`Stack`, `Group`, `Paper`) for a clean, hierarchical display.
        *   **Semantic Paths**: Generate paths using lowercased CIM class names and flatten the `attributes` sub-dictionary to remove redundant path segments.
        *   Support for the `length_gt` operator for array-type attributes.
    *   **Nested Rule Builder UI**:
        *   Implement `CimRuleBuilder.tsx` as a recursive component that renders `ConditionGroup` components.
        *   Each group manages its own `logical_op` (AND/OR) and a list of `conditions` (either simple condition objects or nested groups).
    *   **Zoom-Level Rendering**:
        *   The frontend must filter rendered nodes and edges based on the `min_zoom` and `max_zoom` properties of the matching display rule.
        *   This filtering should happen in real-time in the `GridMap` based on `viewState.zoom`.
#### Display Rules Router (`display_rule_routes.py`)
- Standard CRUD endpoints (`/configs`, `/rules`) backed by `admin_config.db`.
- Complex filtering evaluations happen in pure Python.
- **Security:** Modifying endpoints are protected via FastAPI `HTTPBasic` authentication leveraging a SQLite `users` table with PBKDF2 hashing. Account creation and modification routes are exclusively exposed through the Node/Fastify Admin Console and pure Python CLI overrides.
*   **Backend (FastAPI & Data Ingestion)**:
    *   **Data Ingestion (CIM):** The CIM ingestor must effectively extract robust asset taxonomy, correctly tagging `Substation`, `Breaker`, `Switch`, `Transformer`, and `Meter` types. Determine the switch 'open' status for visualizations.
    *   **Graph Export Endpoint:** An endpoint to export the full grid (or a simplified version) as JSON (nodes and links) for the frontend visualization library.
    *   **Time Series Endpoints:** Endpoints to fetch consumption metrics must support dynamic start/end ISO strings and perform phase-weighted aggregation using node phasing attributes.
    *   **Display Rule Management API**:
        *   **Duplicate Rule**: `POST /api/display-rules/rules/{rule_id}/duplicate` duplicates a rule and its configuration.
        *   **Enable/Disable**: Rules carry an `enabled` flag (Boolean) to control their application at runtime.
    *   **Phase Aggregation Logic**: Multi-phase loads are assumed to be balanced. Aggregation must use a weight-based join: `SUM(kwh_dlv * weight_p)` where `weight_p` is `1.0 / count(display_phases)` for each phase present on the node (where display_phases are A, B, or C). If no A, B, or C phases are present, split equally across all three.
    *   **Imbalance Calculation**: Calculate the Negative Sequence Component magnitude ($|S_2|$) using: $|S_2| = \frac{1}{3} \sqrt{(kwh_a - 0.5 \cdot kwh_b - 0.5 \cdot kwh_c)^2 + (0.866 \cdot (kwh_b - kwh_c))^2}$.
    *   **Nested Rule Evaluation**:
        *   Implement `DisplayRuleEngine._check_conditions` as a recursive function to evaluate nested `logical_op` groups.
        *   Ensure support for operators: `==`, `!=`, `>`, `<`, `>=`, `<=`, `exists`, `not_exists`, `contains`, `length_gt`.
        *   Condition matching must accurately traverse both the node's properties and any `attached_equipment` matching a `target_class`.
    *   Existing Endpoints: Re-use `/api/analytics/phase-balance/{node_id}` to calculate the downstream aggregations upon node click.

## 4. Admin Console Service (Node.js/Fastify)
* **Core**: Use Fastify for high-performance Node.js service implementation.
* **Architecture**: Follow Vertical Slice Architecture.
* **Shared Configuration**:
    * **Storage**: SQLite database in a shared Docker volume (`grid_config`).
    * **Access**: Admin Console has read-write access; Analytical Backend has read-only access.
    * **Configuration Sync**: Analytical Backend must poll/watch the shared database for changes and reload its internal state accordingly.
* **State Persistence**: Use SQLite for internal admin console state as per rule #4.

## 5. Advanced Backend Capabilities
* **Synthetic AMI Generation**: Generate synthetic AMI time-series metrics traversing from 2025 through 2027.
* **Alarms Dataset Integration**:
    * **Relational Storage**: Active alarms and metadata stored in a dedicated `alarms` table in DuckDB.

## 6. Technology Stack
* **Language**: Python (Backend), TypeScript/JavaScript (Frontend & Admin Console).
* **Environment**: Developed and deployed via Anti-gravity IDE.
* **Libraries**: Minimize the number of external libraries. Use only well-established libraries that will be supported long-term.

## 7. Environment Configuration
* **Port Mapping**: Docker Compose services must use environment variables for host port mapping with sensible defaults.

## 8. Testing & Quality Assurance
* **Test-Driven Development (TDD)**: Always follow TDD best practices.

## 9. Deployment & Optimization
*   **Docker Build Performance**:
    *   All services must include `.dockerignore` files to exclude `node_modules`, `.venv`, and other build artifacts from the context.
    *   Dockerfiles should use multi-stage builds where applicable to minimize final image size.
    *   Verify build integrity for all services (frontend, backend, docs, admin console) from the root `docker-compose.yml`.
*   **Data Lifecycle Tools**:
    *   The `generator` service must support a `REFRESH_DB` environment variable.
    *   When `REFRESH_DB=true`, the service must clear all databases (DuckDB, SQLite topology, and Admin configuration) and Parquet files in the shared volume before starting the ingestion/generation process.

## 10. Graph Search Engine
* **Edge Indexing**: The search service must index edge entities (conductors, lines) in addition to nodes.
* **Fast Lookup**: Search should use efficient string matching (contains/starts-with) across both device names and IDs.
