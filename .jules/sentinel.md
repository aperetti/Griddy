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
## 2026-06-14 - Unauthenticated Admin Endpoints & DoS via Synchronous Crypto
**Vulnerability:** The `admin-console/admin-backend/src/features/users/routes.ts` lacked authentication, allowing unauthorized users to list, create, and delete administrative accounts. Additionally, the route used synchronous `crypto.pbkdf2Sync` equivalent which blocks the Node.js event loop, creating a DoS vulnerability. Finally, password verification lacked safe buffer length checking before `timingSafeEqual`.
**Learning:** Security features like authentication must be consistently applied via route-level hooks rather than assumed by architecture. Furthermore, when working with crypto in a single-threaded environment like Node.js, asynchronous alternatives (e.g. `util.promisify(crypto.pbkdf2)`) must always be used to prevent application denial of service. Lastly, `timingSafeEqual` throws unhandled exceptions if lengths differ, requiring length checks beforehand.
**Prevention:** Implement `fastify.addHook('onRequest', ...)` for sensitive endpoint groups. Always use async cryptography implementations in Node.js route handlers. Always verify `buffer1.length === buffer2.length` before passing values to `crypto.timingSafeEqual`.
