# Security Model: Dynamic Extensions

This document outlines the security architecture, risks, and mitigations for the dynamic installation of Plugins and AMI Adapters in Griddy.

## 1. Threat Model: "Trusted Administrator"

Griddy follows a **Trusted Administrator** security model. This assumes that access to the Admin Console is restricted to authorized personnel who have been vetted and are trusted not to intentionally harm the system.

### Core Assumptions:
*   The person with Admin Console access is legitimate.
*   The system where the Admin Console is accessed is secure.
*   The administrator is responsible for verifying the source and safety of uploaded extension packages.

## 2. Implemented Mitigations

Despite the trusted model, Griddy implements several technical safeguards to prevent accidental or low-effort attacks (e.g., "ZIP Slip" or unauthorized file system writes).

### 2.1 Safe ZIP Extraction (Anti-ZIP Slip)
The extraction process in the Admin Backend does **not** use the raw system `unzip` command directly on user input. Instead, it delegates to a specialized Python script (`backend/scripts/safe_extract.py`) that performs:
*   **Path Validation:** Every filename within the ZIP is checked to ensure it is strictly relative to the target directory. Attempts to use `../` or absolute paths are detected and rejected.
*   **Segment Matching:** Validation is performed using `os.path.commonpath`, ensuring that file names that merely share a prefix with the target directory (e.g., `/app/infra-secrets`) are blocked.

### 2.2 Extension Whitelisting
To prevent the placement of dangerous file types (e.g., shell scripts, binaries) into the configuration volume, the extractor enforces a strict extension whitelist:
*   **Allowed:** `.py`, `.js`, `.json`, `.png`, `.svg`, `.css`, `.map`, `.md`.
*   Any ZIP containing files outside this list is rejected.

### 2.3 Manifest Enforcement
Every Plugin extension **must** contain a `manifest.json` at the root of the ZIP. This ensures that the system can properly identify and categorize the extension before it is registered.

### 2.4 Least Privilege (Volume Isolation)
Extensions are extracted to a specific subdirectory within the persistent volume (`/data/config/plugins/` or `/data/config/adapters/`). This volume is separated from the core application source code, minimizing the risk of a malicious extension overwriting core system files.

## 3. Residual Risks

Administrators must be aware of the following residual risks:

### 3.1 Remote Code Execution (RCE)
By design, this feature allows the execution of Python code (backend routes/adapters). If an administrator uploads a malicious Python script, it will execute with the full privileges of the `grid-backend` container.

### 3.2 Cross-Site Scripting (XSS)
Uploaded UI components (`ui/index.js`) are executed in the browsers of all platform users. A malicious UI component can steal session data or perform actions on behalf of the user.

## 4. Administrator Responsibilities

To maintain the security of the Griddy platform, administrators **must**:
1.  **Restrict Access:** Use strong passwords and (ideally) Multi-Factor Authentication for all Admin Console accounts.
2.  **Verify Source:** Only install extensions from known, trusted developers or internal utility teams.
3.  **Audit Code:** Manually inspect the contents of a ZIP package (especially `.py` and `.js` files) before uploading it to the platform.
4.  **Monitor Logs:** Regularly check the Loki logs for any suspicious activity originating from installed extensions.
