## 2024-05-20 - Default Admin Password Vulnerability
**Vulnerability:** Hardcoded default administrator password ("admin") during initial database setup.
**Learning:** Default credentials are a major vector for automated attacks. If an instance is deployed and the default password is not changed immediately, the system is exposed.
**Prevention:** Use environment variables for initial setup configuration (`INITIAL_ADMIN_PASSWORD`), or gracefully fallback to dynamically generating a secure, random password (e.g., using `secrets.token_hex()`) and printing it to the logs/stdout for the deployer.

## 2026-05-18 - Cypher Injection & Hardcoded Credentials
**Vulnerability:** A fallback default password was hardcoded to "password123" for Neo4j connections, and a Cypher injection vulnerability existed due to f-string interpolation of user input (`class_name`) in `backend/src/shared/cim/repository.py`.
**Learning:** Hardcoded credentials should never be used, even as a default fallback, as they can lead to unauthorized access in misconfigured environments. Furthermore, dynamic query construction must always use parameterized inputs to prevent injection attacks, especially in graph databases like Neo4j.
**Prevention:** Fallback passwords should be empty strings or dynamically generated if appropriate, and query variables should be passed securely via parameter bindings (e.g. `$class_name` in Cypher).

## 2025-05-20 - Command Injection & Path Traversal in File Uploads
**Vulnerability:** User-uploaded files were susceptible to command injection and path traversal because `child_process.exec` was used with a shell, and `data.filename` was directly concatenated into the target path.
**Learning:** Even when the primary logic is implemented in a Python helper script, the wrapper code invoking the helper must securely pass arguments. Unsanitized file uploads are a prime vector for these attacks.
**Prevention:** Always use `path.basename()` to sanitize user-provided filenames to prevent path traversal. Always execute system commands using safer APIs like `child_process.execFile` (or a `runCommand` wrapper) that accept arguments as an array instead of concatenating strings for the shell.
