# Project Guidelines

## Requirements Management
1. Always update `functional-requirements.md` when new business requirements are introduced by the developer.
2. Always update `technical-requirements.md` when new technical requirements are introduced by the developer.
3. Organize business requirements into functional areas.
10. Always reference the requirements documents.

## Technology Defaults
4. Unless specified, use **React (TS)**, **Mantine**, **Deck.gl**, **ECharts** (Frontend); **FastAPI**, **DuckDB**, **Neo4j** (Backend); **Node.js (Fastify)**, **SQLite** (Admin).
17. Use Python to interact with SQLite — not the SQLite executable.
18. Development environment is **Windows** using **PowerShell** as the command prompt.

## Architecture
8. **Vertical Slice Architecture**: Organize code by feature area (e.g., `grid`, `analytics`, `display-rules`) rather than technical layers. A single file must **never** handle more than one responsibility.
9. Before writing any code, suggest a file structure that follows the Clean Architecture pattern, ensuring no single file handles more than one responsibility.
10. **Performance Budgeting**: Every new API endpoint or complex analytical computation must be validated against a performance budget. Target latency for standard grid traversals is <200ms; complex analytical aggregations (e.g., consumption) should aim for <1s for 1-year windows.
12. **Move Business Logic to "Model"** — In a Vertical Slice architecture, the model is where data structures and transformations live. Heavy data mapping (e.g., converting API responses into display formats) does not belong in `.tsx` files. New file: `src/features/{area}/model/{Name}.ts`. What goes here: pure functions, TypeScript interfaces.
13. **Utilize the Context Pattern** — If prop-drilling occurs, wrap that section of the tree in a local Context. Folder: `src/features/{area}/context/{Function}Context.tsx`. This keeps components clean of state-passing logic.
14. **Extract Logic into Custom Hooks** — If a component contains complex `useEffect` hooks, API calls, or state transitions, move them into a local hook within the feature folder.
15. **Sub-component Decomposition** — Check if JSX can be broken into smaller, "dumb" presentational components.
16. **Rule of 300** — If a component exceeds 300 lines, extract hooks. If it exceeds 500 lines, it is almost certainly handling too many UI responsibilities and needs sub-components.

## Observability & Performance
21. **Observability-Driven Development (ODD)**: Leverage the Grafana LGTM stack (Loki, Tempo, Alloy) during development. Use traces to identify architectural "leaks" (e.g., unexpected N+1 queries to Neo4j or redundant DuckDB scans).
22. **Structured Logging**: All backend logs must be structured and include relevant context (e.g., `mrid`, `node_id`, `session_id`). Use Loki to correlate logs across the Backend and Admin Console.
23. **Trace Propagation**: Ensure OpenTelemetry trace context is propagated through all service boundaries. Every significant analytical operation (e.g., phase propagation, load aggregation) must be wrapped in a named span.
24. **Performance Validation**: Before finalizing a feature, verify its performance signature in Grafana. If a change increases baseline latency by >15%, it must be justified or optimized.

## Libraries
7. Minimize external libraries. Use only well-established libraries that will be supported long-term.

## Testing
5. When testing functionality, always memorialize tests in unit or functional tests.
6. Always follow **Test-Driven Development (TDD)** best practices.
11. When testing APIs and functionality, do **not** test using command-line tools like `curl` or ad-hoc Python scripts. Instead, add a unit test or integration test to the test suite so the test case is preserved.
19. As you build out the frontend, add **Playwright e2e tests** to ensure no breaking changes are introduced.
20. Always check whether new functionality will break existing Playwright tests. If it is unclear whether existing behavior should be preserved, ask the user with an implementation plan before proceeding. Then update the Playwright tests accordingly.
