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

*   **Backend (FastAPI & Data Ingestion)**:
    *   **Data Ingestion (CIM):** The CIM ingestor must effectively extract robust asset taxonomy, correctly tagging `Substation`, `Breaker`, `Switch`, `Transformer`, and `Meter` types. Determine the switch 'open' status for visualizations.
    *   **Graph Export Endpoint:** An endpoint to export the full grid (or a simplified version) as JSON (nodes and links) for the frontend visualization library.
    *   **Time Series Endpoints:** Endpoints to fetch consumption metrics must support dynamic start/end ISO strings and perform phase-weighted aggregation using node phasing attributes.
    *   **Phase Aggregation Logic**: Multi-phase loads are assumed to be balanced. Aggregation must use a weight-based join: `SUM(kwh_dlv * weight_p)` where `weight_p` is `1.0 / count(display_phases)` for each phase present on the node (where display_phases are A, B, or C). If no A, B, or C phases are present, split equally across all three.
    *   **Imbalance Calculation**: Calculate the Negative Sequence Component magnitude ($|S_2|$) using: $|S_2| = \frac{1}{3} \sqrt{(kwh_a - 0.5 \cdot kwh_b - 0.5 \cdot kwh_c)^2 + (0.866 \cdot (kwh_b - kwh_c))^2}$.
    *   Existing Endpoints: Re-use `/api/analytics/phase-balance/{node_id}` to calculate the downstream aggregations upon node click.
    *   **Analytical Data Export**:
        *   **Client-Side Processing**: Large datasets must be transformed and downloaded directly from the browser to minimize server overhead.
        *   **Format Support**: 
            - Automated format selection (CSV for tabular/flat data, JSON for nested diagnostic data).
            - Filename generation must include standardized ISO timestamps.

## 4. Admin Console Service (Node.js/Fastify)
* **Core**: Use Fastify for high-performance Node.js service implementation.
* **Docker Integration**: Interface with Docker via `child_process` (Docker Compose) or API to manage grid services.
* **System Integration**: Call Python-based data generation and ingestion scripts.
* **State Persistence**: Use SQLite for internal admin console state (logs, job history, and configuration overrides) as per rule #4.
* **Architecture**: Follow Vertical Slice Architecture, organizing by feature (docker, data, config, mapping).

## 5. Advanced Backend Capabilities
* **Synthetic AMI Generation**: Generate synthetic AMI time-series metrics traversing from 2025 through 2027.
* **Alarms Dataset Integration**:
    * **Relational Storage**: Active alarms and metadata stored in a dedicated `alarms` table in DuckDB.
    * **Log Storage**: Historical alarm logs should be stored in Parquet format in `cim_alarms/` directory for high-performance temporal queries.

## 6. Technology Stack
* **Language**: Python (Backend), TypeScript/JavaScript (Frontend & Admin Console).
* **Environment**: Developed and deployed via Anti-gravity IDE.
* **Libraries**: Minimize the number of external libraries. Use only well-established libraries that will be supported long-term.

## 7. Environment Configuration
* **Port Mapping**: Docker Compose services must use environment variables for host port mapping with sensible defaults:
    * `BACKEND_PORT`: Default `8000`
    * `FRONTEND_PORT`: Default `8080`
    * `WEBSITE_PORT`: Default `3000`
    * `ADMIN_CONSOLE_PORT`: Default `8090`

## 8. Testing & Quality Assurance
* **Test-Driven Development (TDD)**: Always follow TDD best practices.
* **Unit/Functional Tests**: Always create and memorialize functionality in unit or functional tests.
