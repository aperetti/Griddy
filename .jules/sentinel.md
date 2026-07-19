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

## 2026-05-26 - Missing Admin Endpoint Authentication & Unsafe Crypto Timing
**Vulnerability:** The admin console backend API endpoints lacked authentication, allowing unauthenticated configuration changes and data ingestion. Additionally, implementing basic auth using synchronous `crypto.pbkdf2Sync` or simple string comparisons poses DoS and timing attack vulnerabilities.
**Learning:** Admin endpoints must always be secured (e.g. using `fastify.register` scoped authentication hooks). When validating cryptographic materials like passwords, using an asynchronous derivation function prevents blocking the main event loop, and using `crypto.timingSafeEqual` prevents timing attacks (though it requires equal buffer lengths to avoid crashes).
**Prevention:** Wrap all protected administrative routes in a secure `preHandler` hook. Use `util.promisify(crypto.pbkdf2)` for password hashing within the hook, and ensure that buffers are of equal length before comparing them using `crypto.timingSafeEqual`.

## 2026-07-19 - DuckDB SQL Injection Vulnerability via f-strings
**Vulnerability:** User-provided inputs (`start_time` and `end_time`) were directly interpolated into DuckDB SQL queries via f-strings (e.g., `f"... WHERE r.timestamp >= '{st_lit}' ..."`) in `DuckDBMeterDataRepository`, which could lead to SQL injection vulnerabilities.
**Learning:** String replacement (like `start_time.replace("'", "''")`) is not a robust method for preventing SQL injection, and f-string concatenation for query building is a known anti-pattern in the shared adapter.
**Prevention:** Always construct DuckDB SQL queries using proper parameterized inputs with `?` placeholders (e.g., `conn.execute(..., [start_time, end_time])`) rather than directly interpolating untrusted variables, including inside `EXPLAIN ANALYZE` or `CREATE TEMP TABLE`.
