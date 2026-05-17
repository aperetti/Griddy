# Comprehensive Architectural Map

## 1. Physical Structure & Slice Boundaries

The system follows a **Vertical Slice Architecture**, organizing code by feature area rather than technical layer. This structure is replicated across the Backend, Frontend, and Admin Console.

### 1.1 Backend (Python / FastAPI)
Located in `backend/src/`.
- **`grid/`**: Core topology management. Graph indexing (NetworkX), CIM mapping, Sprite generation, and the Display Rule Engine.
- **`analytics/`**: High-level analytical computations. Consumption, Voltage, and Phase Balancing logic.
- **`discovery/`**: Search and relationship discovery (Upstream/Downstream).
- **`agent/`**: AI-driven natural language translation to SQL.
- **`shared/`**: Cross-cutting concerns. `CimModelRegistry`, persistence repositories (`DisplayRuleRepository`, `AlarmRepository`), and telemetry.

### 1.2 Frontend (React TS / Mantine)
Located in `frontend/src/`.
- **`features/grid/`**: Interactive Map (Deck.gl), Display Rule UI, Global Search, and Rule Assistant.
- **`features/analytics/`**: Topology Tree, Alarms List, and Global Settings.
- **`shared/components/`**: Draggable floating windows (`AnalysisWindow`), specialized explorers (`AssetIntegratedExplorer`, `DiagnosticModal`).
- **`plugins/`**: Decoupled analysis modules.

### 1.3 Admin Console (Node.js / Fastify)
Located in `admin-console/admin-backend/src/`.
- **`features/config/`**: System-wide reactive configuration.
- **`features/data/`**: Data lifecycle management (Refresh/Ingest).
- **`features/users/`**: Authentication and user management.

## 2. Component Interaction Map

### 2.1 The Graph Core
- **Source of Truth**: Neo4j (Persistent Graph) and DuckDB/Parquet (Analytical/Time-series data).
- **In-Memory Cache**: `CimModelRegistry` (Backend) maintains multiple feeder models using `NetworkX` for sub-second traversals.
- **Client Synchronization**: The Frontend `GridMap` subscribes to the registry to fetch and render topology layers via Deck.gl.

### 2.2 Display Rule Pipeline
1. **Definition**: User creates rules in `DisplayRulesManager` (Frontend).
2. **Persistence**: Rules saved to `rules.sqlite` via `DisplayRuleRepository` (Backend).
3. **Application**: `DisplayRuleEngine` (Backend) evaluates rules against CIM entities to generate visual metadata.
4. **Rendering**: Map layers use the metadata to select sprites from the `SpriteAtlas` generated on the fly.

### 2.3 Plugin Execution Flow
- **Registration**: Plugins register themselves with the `PluginSDK` (Backend) and a registry map (Frontend).
- **Context Awareness**: `AnalysisWindowLayer` (Frontend) manages the lifecycle of plugin windows, providing them with the selected node context.
- **Isolation**: Plugins use the `PluginSDK` to safely query core data without direct database access.

## 3. Principle Alignment Analysis

| Principle | Documentary Requirement | Architectural Reality | Status |
| :--- | :--- | :--- | :--- |
| **Vertical Slice** | GEMINI.md #8, TR #1 | Slices defined by feature (`grid`, `analytics`). | ✅ Aligned |
| **SRP (File Level)** | GEMINI.md #8, TR #1 | Recent refactorings (e.g., `DisplayRulesManager`) fixed previous violations. | ✅ Aligned |
| **Business in Model** | GEMINI.md #12 | Transformations moved to `model/` folders. | ✅ Aligned |
| **Backend Repo Pattern**| GEMINI.md #13 | `DisplayRuleRepository` established; others (e.g., `Topology`) still mixed. | ⚠️ Improving |
| **Plugin Isolation** | TR #3.2, GEMINI.md #14| Leaky dependencies moved to `shared/components`. | ✅ Aligned |
| **Performance Budget** | GEMINI.md #10 | ODD stack (Tempo/Loki) is integrated to monitor latency. | ✅ Aligned |

## 4. Identified Discrepancies & Recommendations

### 4.1 Topology Repository (Backend)
- **Discrepancy**: While Display Rules use a Repository, the core Topology/CIM logic in `backend/src/grid` still contains embedded SQL and Neo4j queries in some service files.
- **Recommendation**: Create `TopologyRepository` and `CimRepository` to finish the backend persistence realignment.

### 4.2 Shared Utilities Drift
- **Discrepancy**: `frontend/src/shared/utils` and `frontend/src/shared/hooks` are growing large.
- **Recommendation**: Audit these for feature-specific logic that should be moved back into a slice (e.g., `useDisplayRules` should be strictly in `features/grid`).

### 4.3 Documentation Sync
- **Discrepancy**: The `functional-requirements.md` does not explicitly mention the "Repository Pattern" added to technical mandates.
- **Recommendation**: None; Functional docs should focus on *what*, Technical docs on *how*. The alignment is correct.
