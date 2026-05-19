## 2024-05-20 - Default Admin Password Vulnerability
**Vulnerability:** Hardcoded default administrator password ("admin") during initial database setup.
**Learning:** Default credentials are a major vector for automated attacks. If an instance is deployed and the default password is not changed immediately, the system is exposed.
**Prevention:** Use environment variables for initial setup configuration (`INITIAL_ADMIN_PASSWORD`), or gracefully fallback to dynamically generating a secure, random password (e.g., using `secrets.token_hex()`) and printing it to the logs/stdout for the deployer.
## 2024-05-24 - Node.js Synchronous Crypto DoS
**Vulnerability:** Using `crypto.pbkdf2Sync` in a Fastify request handler blocked the Node.js event loop, creating a Denial of Service risk.
**Learning:** Node.js is single-threaded. Heavy cryptographic operations MUST be asynchronous to prevent starving other requests.
**Prevention:** Always use `util.promisify(crypto.pbkdf2)` or native async crypto methods in request paths.

## 2024-05-24 - Unhandled Exceptions in timingSafeEqual
**Vulnerability:** `crypto.timingSafeEqual` throws an unhandled TypeError if the buffer lengths do not match, causing 500 errors or application crashes.
**Learning:** Security functions can introduce new crash vectors if their input constraints (like matching byte length) are not respected.
**Prevention:** Explicitly check `buf1.length === buf2.length` before calling `crypto.timingSafeEqual`.
