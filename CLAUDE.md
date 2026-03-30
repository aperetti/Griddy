# Project Guidelines

## Requirements Management
1. Always update `functional-requirements.md` when new business requirements are introduced by the developer.
2. Always update `technical-requirements.md` when new technical requirements are introduced by the developer.
3. Organize business requirements into functional areas.
10. Always reference the requirements documents.

## Technology Defaults
4. Unless specified, use **SQLite**, **Mantine**, and **Node.js (Fastify)**.
17. Use Python to interact with SQLite — not the SQLite executable.
18. Development environment is **Windows** using **PowerShell** as the command prompt.

## Architecture
8. Ensure clean architecture patterns — a single file must **never** handle more than one responsibility.
9. Before writing any code, suggest a file structure that follows the Clean Architecture pattern, ensuring no single file handles more than one responsibility.
12. **Move Business Logic to "Model"** — In a slice architecture, the model is where data structures and transformations live. Heavy data mapping (e.g., converting API responses into display formats) does not belong in `.tsx` files. New file: `src/features/{area}/model/{Name}.ts`. What goes here: pure functions, TypeScript interfaces.
13. **Utilize the Context Pattern** — If prop-drilling occurs, wrap that section of the tree in a local Context. Folder: `src/features/{area}/context/{Function}Context.tsx`. This keeps components clean of state-passing logic.
14. **Extract Logic into Custom Hooks** — If a component contains complex `useEffect` hooks, API calls, or state transitions, move them into a local hook within the feature folder.
15. **Sub-component Decomposition** — Check if JSX can be broken into smaller, "dumb" presentational components.
16. **Rule of 300** — If a component exceeds 300 lines, extract hooks. If it exceeds 500 lines, it is almost certainly handling too many UI responsibilities and needs sub-components.

## Libraries
7. Minimize external libraries. Use only well-established libraries that will be supported long-term.

## Testing
5. When testing functionality, always memorialize tests in unit or functional tests.
6. Always follow **Test-Driven Development (TDD)** best practices.
11. When testing APIs and functionality, do **not** test using command-line tools like `curl` or ad-hoc Python scripts. Instead, add a unit test or integration test to the test suite so the test case is preserved.
19. As you build out the frontend, add **Playwright e2e tests** to ensure no breaking changes are introduced.
20. Always check whether new functionality will break existing Playwright tests. If it is unclear whether existing behavior should be preserved, ask the user with an implementation plan before proceeding. Then update the Playwright tests accordingly.
