## 2024-03-13 - [DuckDB Parameterized Array Queries]
**Vulnerability:** SQL Injection in DuckDB queries due to string interpolation for IN clauses and timestamps.
**Learning:** DuckDB with Python's DB-API requires dynamic generation of placeholders `?` matched to the exact length of the list, rather than injecting a formatted string. Timestamps also require explicit CAST(? AS TIMESTAMP) to prevent DuckDB parameter type inference errors from failing the query.
**Prevention:** Use `placeholders = ",".join(["?"] * len(nodes_to_query))` and append list variables followed by timestamp strings to the execution `params` array. Never use f-strings for DuckDB Python query parameters.

## 2024-03-14 - [DuckDB SQL Injection via F-strings in Aggregate Consumption Analytics]
**Vulnerability:** CRITICAL: SQL Injection vulnerability in `calculate_consumption.py` where user inputs (`node_ids`, `start_time`, `end_time`) were unsafely injected into DuckDB SQL queries via f-strings. This could allow arbitrary SQL execution or data exfiltration.
**Learning:** This repo's analytics modules have historical vulnerabilities where string concatenation and f-strings are used for SQL queries rather than parameterized queries. Specifically, array parameters like `IN (list)` have been formatted manually.
**Prevention:** Always use `?` placeholders for parameterized queries in DuckDB Python. For list arguments within an `IN` clause, dynamically create placeholders `,`.join([`?`] * len(list)) and pass the variables as a flat array in `conn.execute(query, params)`. Ensure timestamps use `CAST(? AS TIMESTAMP)`.

## 2024-03-15 - [DuckDB SQL Injection via F-strings in Map Voltage Analytics]
**Vulnerability:** CRITICAL: SQL Injection vulnerability in `map_voltage.py` where user inputs (`node_id`, `start_time`, `end_time`) were unsafely injected into DuckDB SQL queries via f-strings. This could allow arbitrary SQL execution or data exfiltration.
**Learning:** Another instance of historical vulnerabilities using string concatenation and f-strings for DuckDB SQL queries. Optional parameters (like `node_id`) appended to queries must still be parameterized to prevent injections.
**Prevention:** Consistently use parameterized queries (`?`) for all SQL parameters in DuckDB, even when conditionally constructing SQL queries. Dynamically generate list placeholders `,`.join([`?`] * len(list)) for `IN` clauses and use `CAST(? AS TIMESTAMP)` for timestamps, supplying arguments securely via `conn.execute(query, params)`.
