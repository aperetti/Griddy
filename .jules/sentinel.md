## 2024-05-20 - Default Admin Password Vulnerability
**Vulnerability:** Hardcoded default administrator password ("admin") during initial database setup.
**Learning:** Default credentials are a major vector for automated attacks. If an instance is deployed and the default password is not changed immediately, the system is exposed.
**Prevention:** Use environment variables for initial setup configuration (`INITIAL_ADMIN_PASSWORD`), or gracefully fallback to dynamically generating a secure, random password (e.g., using `secrets.token_hex()`) and printing it to the logs/stdout for the deployer.

## 2026-05-18 - Cypher Injection & Hardcoded Credentials
**Vulnerability:** A fallback default password was hardcoded to "password123" for Neo4j connections, and a Cypher injection vulnerability existed due to f-string interpolation of user input (`class_name`) in `backend/src/shared/cim/repository.py`.
**Learning:** Hardcoded credentials should never be used, even as a default fallback, as they can lead to unauthorized access in misconfigured environments. Furthermore, dynamic query construction must always use parameterized inputs to prevent injection attacks, especially in graph databases like Neo4j.
**Prevention:** Fallback passwords should be empty strings or dynamically generated if appropriate, and query variables should be passed securely via parameter bindings (e.g. `$class_name` in Cypher).

## 2026-05-25 - Command Injection and Path Traversal in File Uploads
**Vulnerability:** The extensions installation endpoint used unsanitized `data.filename` directly in an `exec` command leading to command injection, and could also be used to construct a `tempPath` allowing path traversal to overwrite arbitrary files outside `/tmp`.
**Learning:** File uploads are inherently dangerous because all attributes (like `filename`) are entirely user-controlled. Using string interpolation with `exec` on unvalidated file names creates an immediate Remote Code Execution (RCE) vector.
**Prevention:** Always sanitize uploaded file names using `path.basename()` before appending to directory paths. Instead of using shell-evaluating functions like `child_process.exec`, always use safer alternatives like `child_process.execFile` (or the existing `runCommand` helper) that accept arguments as an array rather than a single evaluated string.

## 2024-05-20 - [SQL Injection via String Formatting in DuckDB Adapters]
**Vulnerability:** The DuckDB query construction in `backend/src/shared/meter_adapters/duckdb_adapter.py` used Python `f-strings` to directly interpolate unvalidated variables (like `start_time` and `end_time`) into the SQL statement strings. This allowed for potential SQL injection vulnerabilities if user inputs were maliciously crafted to break out of the string literals.
**Learning:** Using `f-strings` or string concatenation (`+`) to inject variables directly into query strings makes the application susceptible to SQL Injection (SQLi) attacks. Even when inputs seemingly come from trusted sources or undergo initial parsing, defensive programming demands structural separation of query logic and data to maintain robust security.
**Prevention:** Always use parameterized placeholders (e.g., `?` or `$1`) within the SQL query template and pass the data variables separately to the query executor (like `conn.execute(query, [start_time, end_time])`). This leverages the database engine's native parsing and escaping mechanics, fully mitigating SQLi risks by preventing data from being interpreted as executable code.
