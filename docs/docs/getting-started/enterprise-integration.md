# Enterprise Implementation & Integration

Utilities operate in a complex data landscape where information is siloed across specialized systems like GIS, ADMS, MDMS, and large-scale Cloud Data Lakes. Griddy is designed to be the "analytical glue" that bridges these silos without requiring a massive data replication effort.

This guide details the narrative for an enterprise-scale implementation.

---

## 1. Topology Synchronization (GIS/ADMS → CIM → Neo4j)

The distribution grid's "source of truth" typically lives in a Geographic Information System (GIS) or an Advanced Distribution Management System (ADMS). To integrate Griddy, these systems must export their models using the **IEC 61970/61968 Common Information Model (CIM)** XML standard.

### The Integration Flow:
1.  **Extract**: The GIS/ADMS system generates a CIM XML export (e.g., daily or on-demand).
2.  **Ingest**: The export is dropped into Griddy's `ingest/` directory.
3.  **Process**: The `grid-ingestor` service automatically parses the XML, maps connectivity to mRIDs (Master Resource IDs), and loads the topology into **Neo4j**.
4.  **Visualize**: Once ingested, the feeder immediately appears as a selectable layer in the Griddy dashboard.

**Enterprise Value**: By leveraging the CIM standard, Griddy ensures that the digital twin in the dashboard perfectly matches the source system's electrical model without custom ETL logic for every new utility.

---

## 2. AMI Data Integration (MDMS → Data Lake → Griddy)

Modern utilities have millions of meters generating hundreds of gigabytes of time-series data daily. Replicating this data into an analytical tool is often impractical and expensive.

### Leveraging the Data Lake:
Griddy's **AMI Data Adapter** architecture allows you to query your existing data warehouse directly. Instead of duplicating data, you implement a custom `IMeterDataRepository`.

*   **MDMS/SCADA**: Continues to pump raw readings into your enterprise data lake (e.g., Snowflake, Databricks, BigQuery).
*   **Griddy Adapter**: When an engineer runs a "Voltage Analysis" in Griddy, the backend sends a "push-down" analytical query to the Data Lake.
*   **Result**: Only the summarized results (e.g., daily medians or KDE bins) travel back to the dashboard, preserving performance and minimizing egress costs.

**Enterprise Value**: Zero-replication analytics. Griddy treats your Data Lake as its own storage engine, ensuring you always analyze the latest "live" readings.

---

## 3. Dynamic Visualization (Display Rules & Profiles)

Large utilities have diverse operational needs that require different perspectives on the same grid data. Griddy uses a centralized **Rule Editor** and **Display Profiles** to manage this visual complexity.

### Centralized Styling Management:
*   **The Rule Editor**: Admins use the editor to create complex, graph-based styling logic (e.g., "Color all transformers with active alarms red" or "Highlight conductors exceeding 80% capacity").
*   **Profiles**: Rules are grouped into named profiles. A user can switch between these profiles to instantly re-style the entire map for a specific analytical task or operational scenario.
*   **Live Propagation**: Changes made in the Admin Console propagate to every connected dashboard instantly, ensuring that all engineers are working with a consistent and up-to-date visual standard.

**Enterprise Value**: This eliminates the need for individual teams to manage their own local styling configurations. It ensures a single, authoritative "visual dictionary" for the digital twin across the entire organization.

---

## 4. Security & Deployment

### Deployment Models
Griddy is container-native and can be deployed in several enterprise environments:
*   **Kubernetes (EKS/GKE/AKS)**: For large-scale, high-availability deployments with automatic scaling of analytical workers.
*   **Private VPC**: The backend remains entirely within the utility's private network, accessing Neo4j and the Data Lake via internal endpoints.

### Enterprise Identity (SSO)
While the base system includes a local SQLite user store, enterprise implementations typically replace the `get_current_username` dependency with a standard **OIDC (OpenID Connect)** or **SAML** provider (e.g., Okta, Azure AD).

---

## 5. Summary: The Utility Workflow

1.  **Sync Topology**: GIS exports CIM; Griddy updates its property graph.
2.  **Connect AMI**: MDMS feeds the Data Lake; Griddy's adapter queries it on-the-fly.
3.  **Define Rules**: Admins set up Display Profiles to standardize grid visualization.
4.  **Analyze**: Engineers log in via SSO, select their feeder, and perform deep analytical dives using geospatial and graph-based tools.
