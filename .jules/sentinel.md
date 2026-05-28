## 2024-05-20 - Default Admin Password Vulnerability
**Vulnerability:** Hardcoded default administrator password ("admin") during initial database setup.
**Learning:** Default credentials are a major vector for automated attacks. If an instance is deployed and the default password is not changed immediately, the system is exposed.
**Prevention:** Use environment variables for initial setup configuration (`INITIAL_ADMIN_PASSWORD`), or gracefully fallback to dynamically generating a secure, random password (e.g., using `secrets.token_hex()`) and printing it to the logs/stdout for the deployer.

## 2026-05-18 - Cypher Injection & Hardcoded Credentials
**Vulnerability:** A fallback default password was hardcoded to "password123" for Neo4j connections, and a Cypher injection vulnerability existed due to f-string interpolation of user input (`class_name`) in `backend/src/shared/cim/repository.py`.
**Learning:** Hardcoded credentials should never be used, even as a default fallback, as they can lead to unauthorized access in misconfigured environments. Furthermore, dynamic query construction must always use parameterized inputs to prevent injection attacks, especially in graph databases like Neo4j.
**Prevention:** Fallback passwords should be empty strings or dynamically generated if appropriate, and query variables should be passed securely via parameter bindings (e.g. `$class_name` in Cypher).

## 2024-05-29 - Command Injection & Path Traversal in Admin Extensions Route
**Vulnerability:** Fastify multipart file upload route in admin backend accepted user-provided filenames directly into shell command strings (via `child_process.exec`) and temporary file paths without sanitization, leading to critical command injection and path traversal risks.
**Learning:** Node.js file upload handling that relies on user-provided filenames (like `data.filename` from Fastify multipart) must never be trusted. Passing user input directly into `child_process.exec` creates an immediate command injection vulnerability. Appending user-provided filenames directly to base paths creates path traversal vulnerabilities.
**Prevention:** Always use safe wrapper functions (like `runCommand` using `child_process.execFile` with an arguments array) instead of executing raw command strings to prevent shell interpretation. Always sanitize user-provided filenames using `path.basename()` before joining them with base directories.
