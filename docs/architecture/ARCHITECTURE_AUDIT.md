# Architecture Audit & Alignment Report

## Executive Summary
This report provides a high-level overview of the current system architecture, identifies areas where the established architectural principles (Vertical Slice, Clean Architecture) have been diluted, and provides actionable recommendations to realign the codebase.

## 1. Existing Architecture Overview

### 1.1 Frontend (React TS)
- **Organization**: Follows a hybrid Vertical Slice/Layered approach.
- **Slices**: `grid`, `analytics`, `ui`.
- **Shared**: `hooks`, `services`, `shared`, `components`.
- **Plugins**: Isolated under `plugins/`, but with some dependency leaks.

### 1.2 Backend (FastAPI)
- **Organization**: Primarily Vertical Slice.
- **Slices**: `grid`, `analytics`, `discovery`, `agent`.
- **Shared**: `shared`.
- **Plugin System**: Routers located in `plugins/`, using `PluginSDK`.

### 1.3 Admin Console (Fastify/Node)
- **Organization**: Vertical Slice under `features/`.

## 2. Principle Alignment Audit

| Principle | Source | Status | Observations |
| :--- | :--- | :--- | :--- |
| **Vertical Slice Architecture** | GEMINI.md #8 | ✅ Generally Followed | Core logic is grouped by feature area. |
| **Clean Architecture (SRP)** | GEMINI.md #8 | ⚠️ Diluted | Large files like `DisplayRulesManager.tsx` and `display_rule_engine.py` handle multiple responsibilities. |
| **Business Logic in Model** | GEMINI.md #12 | ❌ Diluted | Sorting, grouping, and data transformation logic found in `.tsx` components. |
| **Context Pattern** | GEMINI.md #13 | ✅ Followed | `SchemaContext` and others are used, but could be expanded to reduce prop-drilling in complex features. |
| **Rule of 300/500** | GEMINI.md #16 | ⚠️ Near Limit | `App.tsx` (303) and `DisplayRulesManager.tsx` (465) are approaching or at limits for refactoring. |
| **Plugin Isolation** | TR Section 3.2 | ❌ Violated | Plugins are importing directly from feature slices (e.g., `features/analytics`). |

## 3. Identified Dilutions & Risks

### 3.1 Frontend Component Bloat
The `DisplayRulesManager.tsx` is a "Mega-Component" that manages:
- Local UI state for sorting, grouping, and filtering.
- Authentication state and overlays.
- Multiple modal states (Confirmation, Input, Live Editor).
- Table rendering and action dispatching.
*Risk*: High cognitive load for developers, difficult to test in isolation, high risk of regressions during UI changes.

### 3.2 Model Layer Underutilization
Transformation logic (e.g., parsing CIM classes from rules for grouping) is performed inside the `useMemo` of components.
*Risk*: Logic duplication, inability to unit test transformations without mounting components.

### 3.3 Plugin Dependency Leakage
Plugins like `diagnostic_explorer` import `AnalysisWindow` from `features/analytics`.
*Risk*: Changes to the core analytics feature can silently break plugins.

### 3.4 Backend Route Monoliths
`display_rule_routes.py` contains raw SQL queries and complex business logic (e.g., default config management).
*Risk*: Tight coupling to SQLite schema, difficult to mock for unit tests.

## 4. Recommendations for Alignment

### Phase 1: Frontend Refactoring (Non-Breaking)
1. **Decompose `DisplayRulesManager`**:
    - Extract `RuleTable` for the main grid.
    - Extract `ConfigSelector` for the top toolbar.
    - Extract `RuleAuthOverlay` for the password entry.
2. **Implement Model Functions**:
    - Move `processRules` (sorting/grouping) to `features/grid/model/rules.ts`.
3. **Establish `Shared` Analytics UI**:
    - Move `AnalysisWindow` from `features/analytics` to `shared/components/AnalysisWindow` to satisfy plugin isolation requirements.

### Phase 2: Backend Realignment
1. **Repository Pattern**:
    - Introduce `DisplayRuleRepository` to handle SQLite interactions, keeping routes clean.
2. **Logic Extraction**:
    - Move complex condition evaluation from `DisplayRuleEngine` into smaller, testable `EvaluationStrategy` classes.

### Phase 3: Infrastructure & Tooling
1. **Linting Rules**:
    - Add custom ESLint rules to prevent `plugins/` from importing from `features/`.
2. **Architectural Guardrails**:
    - Update `GEMINI.md` to explicitly forbid direct SQL in routes.

## 5. Implementation Plan (Next Steps)
1. [ ] Create `shared/components` and migrate leaky dependencies.
2. [ ] Refactor `DisplayRulesManager` into sub-components.
3. [ ] Extract Model logic for Rule processing.
4. [ ] Introduce Repository layer in `backend/src/grid`.
