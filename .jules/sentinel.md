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

## 2026-06-01 - Missing Authentication on Admin Endpoints & Blocking Crypto
**Vulnerability:** Critical administrative endpoints in the Node.js Fastify backend (`/api/data`, `/api/display-rules`, `/api/users`, etc.) were exposed without any authentication, allowing unauthenticated access. Furthermore, authentication logic requires password verification, but synchronous crypto (`crypto.pbkdf2Sync`) can block the main thread causing Denial of Service (DoS), and direct string/buffer comparison can lead to timing attacks and `TypeError` crashes.
**Learning:** Administrative route protection must be universally applied via middleware hooks (like Fastify's `addHook`). Cryptographic operations in a single-threaded environment like Node.js must be asynchronous. When performing side-channel resistant comparisons, `crypto.timingSafeEqual` is required, but it throws a fatal `TypeError` if buffers are of mismatched lengths, creating a secondary DoS vector if lengths aren't verified first.
**Prevention:** Apply an `adminAuthHook` at the scoped route registration level. Use `util.promisify(crypto.pbkdf2)` for password hashing to yield the event loop. Always verify `buf1.length === buf2.length` prior to calling `crypto.timingSafeEqual()`.
