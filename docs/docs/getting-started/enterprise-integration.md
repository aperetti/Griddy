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

## 3. Organizational Customization (Display Rules & Profiles)

A utility has diverse teams with different analytical needs. Griddy uses **Display Rules and Profiles** to serve these personas from a single deployment.

*   **Planning Engineers**: Focus on long-term trends, load-flow, and capacity. They use a "Planning Profile" that styles the grid by loading intensity and highlights assets exceeding 80% capacity.
*   **Outage Operators**: Focus on real-time health. They use an "Operations Profile" that hides secondary conductors and highlights active alarms and open reclosers.
*   **Field Crews**: Use a "Mobile Optimized Profile" with high-contrast styling and large touch targets for asset location.

**Enterprise Value**: The **Admin Console** allows centralized management of these rules. An admin can update a styling rule (e.g., "Color all transformers with active alarms red") and the change propagates to every user instantly.

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
3.  **Define Rules**: Admins set up Display Profiles for each department.
4.  **Analyze**: Engineers log in via SSO, select their feeder, and perform deep analytical dives using geospatial and graph-based tools.
