## 2024-03-13 - [DuckDB Parameterized Array Queries]
**Vulnerability:** SQL Injection in DuckDB queries due to string interpolation for IN clauses and timestamps.
**Learning:** DuckDB with Python's DB-API requires dynamic generation of placeholders `?` matched to the exact length of the list, rather than injecting a formatted string. Timestamps also require explicit CAST(? AS TIMESTAMP) to prevent DuckDB parameter type inference errors from failing the query.
**Prevention:** Use `placeholders = ",".join(["?"] * len(nodes_to_query))` and append list variables followed by timestamp strings to the execution `params` array. Never use f-strings for DuckDB Python query parameters.

## 2024-03-14 - [DuckDB SQL Injection via F-strings in Aggregate Consumption Analytics]
**Vulnerability:** CRITICAL: SQL Injection vulnerability in `calculate_consumption.py` where user inputs (`node_ids`, `start_time`, `end_time`) were unsafely injected into DuckDB SQL queries via f-strings. This could allow arbitrary SQL execution or data exfiltration.
**Learning:** This repo's analytics modules have historical vulnerabilities where string concatenation and f-strings are used for SQL queries rather than parameterized queries. Specifically, array parameters like `IN (list)` have been formatted manually.
**Prevention:** Always use `?` placeholders for parameterized queries in DuckDB Python. For list arguments within an `IN` clause, dynamically create placeholders `,`.join([`?`] * len(list)) and pass the variables as a flat array in `conn.execute(query, params)`. Ensure timestamps use `CAST(? AS TIMESTAMP)`.

## 2025-03-20 - [Fix SQL Injection in Map Voltage Analytics]
**Vulnerability:** String concatenation (f-strings) was used in DuckDB queries in `backend/src/analytics/map_voltage.py` to directly interpolate start and end timestamps, and a list of node IDs into the IN clause. This posed a severe SQL Injection risk since untrusted variables could easily alter the executing SQL.
**Learning:** Found that DuckDB provides parameterization via `?` placeholders. While timestamps can easily use this placeholder, lists for an IN clause must be dynamically mapped to match the number of parameters (`",".join(["?"] * nodes_count)`).
**Prevention:** Always use parameterized SQL queries (e.g. `?` placeholders with `conn.execute(query, params)`) instead of string concatenation or interpolation (`f""`), and dynamically build placeholders when handling lists of values for IN clauses.
