## 2024-05-20 - Default Admin Password Vulnerability
**Vulnerability:** Hardcoded default administrator password ("admin") during initial database setup.
**Learning:** Default credentials are a major vector for automated attacks. If an instance is deployed and the default password is not changed immediately, the system is exposed.
**Prevention:** Use environment variables for initial setup configuration (`INITIAL_ADMIN_PASSWORD`), or gracefully fallback to dynamically generating a secure, random password (e.g., using `secrets.token_hex()`) and printing it to the logs/stdout for the deployer.

## 2026-05-18 - Cypher Injection & Hardcoded Credentials
**Vulnerability:** A fallback default password was hardcoded to "password123" for Neo4j connections, and a Cypher injection vulnerability existed due to f-string interpolation of user input (`class_name`) in `backend/src/shared/cim/repository.py`.
**Learning:** Hardcoded credentials should never be used, even as a default fallback, as they can lead to unauthorized access in misconfigured environments. Furthermore, dynamic query construction must always use parameterized inputs to prevent injection attacks, especially in graph databases like Neo4j.
**Prevention:** Fallback passwords should be empty strings or dynamically generated if appropriate, and query variables should be passed securely via parameter bindings (e.g. `$class_name` in Cypher).

## 2024-05-25 - Command Injection and Path Traversal in Admin File Upload
**Vulnerability:** The admin extension upload endpoint (`admin-console/admin-backend/src/features/extensions/routes.ts`) passed unsanitized uploaded filenames into a string-interpolated shell command executed via `child_process.exec`. Additionally, the file was saved to `/tmp` using the unsanitized filename directly, creating a path traversal risk.
**Learning:** Node.js `child_process.exec` passes commands directly to a shell, making it extremely vulnerable to command injection if any part of the command string is user-controlled (even filenames).
**Prevention:** Always sanitize uploaded filenames using `path.basename()` before using them in file paths. Never use `child_process.exec` with user-controlled input; instead, use `child_process.execFile` (or the project's `runCommand` wrapper) passing arguments as a strictly separated array to prevent shell metacharacter interpretation.
