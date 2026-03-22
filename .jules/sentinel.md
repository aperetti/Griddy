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
