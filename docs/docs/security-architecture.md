# Security Architecture

Griddy is designed with a **"Secure by Design"** philosophy, utilizing Zero Trust principles to ensure that a compromise in one component (e.g., the public-facing application) does not lead to a full system breach.

## Core Security Pillars

### 1. Least Privilege Data Access
The system utilizes a multi-database strategy to enforce strict access control at the physical and logical layers.

- **Read-Only (RO) Operations:** The Main Backend connects to the `admin.sqlite` and `rules.sqlite` databases using read-only connections. This prevents the core application from modifying user credentials, system configuration, or security rules.
- **Physical Isolation:** Administrative data (users, overrides) is stored separately from application data (display rules) and grid data (Neo4j/DuckDB).

### 2. Management DMZ
The Admin Console is treated as a high-security management zone.

- **Network Isolation:** In production environments, the Admin Console should be placed on a separate management network, accessible only via VPN or authorized administrative subnets.
- **Process Isolation:** The Admin Backend runs as a distinct process with higher filesystem privileges than the Main Backend, which is restricted to its own workspace.

### 3. Hardened Command Execution
Administrative tasks that require shell access (e.g., database bootstrapping or scale data generation) are strictly controlled.

- **Parametric Execution:** The system uses a fixed list of authorized scripts. No user-provided strings are ever passed directly to a shell.
- **Subprocess Security:** Execution is handled via secure APIs that avoid shell interpolation, mitigating Command Injection risks.

### 4. Plugin Integrity
The Plugin SDK ensures that only authorized extensions can influence system behavior.

- **Registry Enforcement:** Only plugins registered in the immutable `plugins.json` manifest are loaded.
- **Manifest-driven UI:** The frontend dynamically generates the UI based on the backend-provided registry, preventing users from "side-loading" unauthorized components.

## Security Matrix

| Component | Network Access | Filesystem Access | Database Access |
| :--- | :--- | :--- | :--- |
| **Main Frontend** | Public (80/443) | Read-only Assets | N/A |
| **Main Backend** | App Internal | Read-only Config | **Admin (RO)**, **Rules (RO)**, Neo4j, DuckDB |
| **Admin Frontend**| Mgmt Only (3002) | Read-only Assets | N/A |
| **Admin Backend** | Mgmt Only (8090) | R/W Config/Ingest | **Admin (R/W)**, **Rules (R/W)** |

## Implementation Roadmap (Zero Trust Phase)

1.  **Logical Split:** Migrating the unified `admin_config.db` into `admin.sqlite` and `rules.sqlite`.
2.  **RO Connection Refactoring:** Updating the Main Backend connection logic to enforce the `mode=ro` flag for SQLite.
3.  **Credential Hardening:** Moving administrative user management exclusively to the Admin Backend.
4.  **Network Shielding:** Updating `docker-compose` to restrict cross-container visibility.
