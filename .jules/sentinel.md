## 2024-03-13 - [DuckDB Parameterized Array Queries]
**Vulnerability:** SQL Injection in DuckDB queries due to string interpolation for IN clauses and timestamps.
**Learning:** DuckDB with Python's DB-API requires dynamic generation of placeholders `?` matched to the exact length of the list, rather than injecting a formatted string. Timestamps also require explicit CAST(? AS TIMESTAMP) to prevent DuckDB parameter type inference errors from failing the query.
**Prevention:** Use `placeholders = ",".join(["?"] * len(nodes_to_query))` and append list variables followed by timestamp strings to the execution `params` array. Never use f-strings for DuckDB Python query parameters.

## 2024-03-14 - [DuckDB SQL Injection via F-strings in Aggregate Consumption Analytics]
**Vulnerability:** CRITICAL: SQL Injection vulnerability in `calculate_consumption.py` where user inputs (`node_ids`, `start_time`, `end_time`) were unsafely injected into DuckDB SQL queries via f-strings. This could allow arbitrary SQL execution or data exfiltration.
**Learning:** This repo's analytics modules have historical vulnerabilities where string concatenation and f-strings are used for SQL queries rather than parameterized queries. Specifically, array parameters like `IN (list)` have been formatted manually.
**Prevention:** Always use `?` placeholders for parameterized queries in DuckDB Python. For list arguments within an `IN` clause, dynamically create placeholders `,`.join([`?`] * len(list)) and pass the variables as a flat array in `conn.execute(query, params)`. Ensure timestamps use `CAST(? AS TIMESTAMP)`.

## 2026-03-18 - [DuckDB SQL Injection via F-strings in Map Voltage Analytics]
**Vulnerability:** CRITICAL: SQL Injection vulnerability in `map_voltage.py` where user inputs (`nodes_list_str`, `start_time`, `end_time`) were unsafely injected into DuckDB SQL queries via f-strings. This could allow arbitrary SQL execution or data exfiltration.
**Learning:** The analytics modules in this repo continue to reveal a pattern of SQL injection vulnerabilities due to historical usage of string concatenation and f-strings for DuckDB Python queries rather than parameterized queries.
**Prevention:** Consistently use `?` placeholders for parameterized queries in DuckDB Python. For dynamic lists in `IN` clauses, dynamically generate placeholders with `",".join(["?"] * len(list))` and append the variables to the execution parameters array. Ensure timestamps use `CAST(? AS TIMESTAMP)`.
## 2024-03-24 - Fix SQL injection in DuckDB VALUES clause
**Vulnerability:** SQL injection vulnerability in `backend/src/analytics/calculate_consumption.py` where `VALUES` clauses were dynamically generated using f-string concatenation containing `node_id`.
**Learning:** Even when building complex mapping CTEs like `phase_weights` in DuckDB, string concatenation should be avoided as it permits SQL injection vectors if input nodes are tampered with.
**Prevention:** Construct a string of placeholders `(?, ?, ?, ?)` for each row in the `VALUES` clause, then pass a flattened list of all parameters (e.g., node IDs and their respective phase weights) in the query execution to ensure they are handled safely by the parameterised engine.

## 2026-03-24 - [Overly Permissive CORS Configuration]
**Vulnerability:** HIGH: The FastAPI backend had an overly permissive CORS configuration (`allow_origins=["*"]`), which allowed any domain to make cross-origin requests, potentially exposing sensitive grid data and APIs.
**Learning:** Development defaults often leak into production environments if not explicitly restricted.
**Prevention:** Always restrict CORS `allow_origins` using environment variables (e.g., `ALLOWED_ORIGINS`) and default to a strict list of internal and trusted local ports (e.g., 3000, 3001, 8000, 8080).

## 2026-03-28 - Timing Attack Vulnerability in Authentication
**Vulnerability:** The authentication logic in `backend/src/shared/auth.py` contained a timing attack vulnerability. It checked if the provided username existed in the database and immediately raised an HTTPException if it did not. If the username did exist, it proceeded to compute an expensive `hashlib.pbkdf2_hmac` hash. This allowed an attacker to enumerate valid usernames by measuring the time it took the server to respond (a fast response meant the user did not exist, a slow response meant the user did exist).
**Learning:** Returning early or skipping expensive operations based on whether a user exists is a common pattern that leaks information about the system's state. When performing authentication, the time taken to process a request should be roughly constant regardless of whether the provided username is valid or not.
**Prevention:** Always perform the expensive hashing operation even if the user is not found. Use a dummy salt and dummy hash for the computation when the user is not found to ensure the computation takes roughly the same amount of time. Always use constant-time comparison functions like `secrets.compare_digest` for comparing hashes and usernames.
