## 2024-05-20 - Default Admin Password Vulnerability
**Vulnerability:** Hardcoded default administrator password ("admin") during initial database setup.
**Learning:** Default credentials are a major vector for automated attacks. If an instance is deployed and the default password is not changed immediately, the system is exposed.
**Prevention:** Use environment variables for initial setup configuration (`INITIAL_ADMIN_PASSWORD`), or gracefully fallback to dynamically generating a secure, random password (e.g., using `secrets.token_hex()`) and printing it to the logs/stdout for the deployer.
## 2024-05-24 - Event Loop Blocking DoS in Fastify Cryptography
**Vulnerability:** Fastify (Node.js) main thread blocked due to use of synchronous cryptography (`crypto.pbkdf2Sync`).
**Learning:** Node.js is single-threaded. Using heavy synchronous cryptographic functions like `crypto.pbkdf2Sync` inside route handlers blocks the main event loop, creating a Denial of Service (DoS) vulnerability, as the server cannot process any other requests until the hashing is complete.
**Prevention:** Always wrap and use asynchronous equivalents (e.g., `util.promisify(crypto.pbkdf2)`) so the expensive cryptographic calculations are deferred to the libuv thread pool, keeping the main loop free to serve concurrent requests.
