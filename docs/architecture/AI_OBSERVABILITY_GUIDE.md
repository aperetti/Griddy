# AI & Developer Observability Guide

This project leverages the LGTM stack (Loki, Grafana, Tempo, Alloy) for advanced debugging. AI agents and developers should use these tools to diagnose complex issues, performance bottlenecks, and transient failures.

## 1. Structured Logging (Loki)

Loki aggregates logs from all Docker containers with structured metadata.

### 1.1 Querying Logs
Use the Loki API to find specific errors or traces.

**Command (PowerShell):**
```powershell
# Find ERROR logs in the backend from the last 15 minutes
curl.exe -G "http://localhost:3100/loki/api/v1/query_range" --data-urlencode 'query={container_name="grid-backend"} |= "ERROR"' --data-urlencode 'start=15m' | python -m json.tool
```

### 1.2 Common Filters
- `{container_name="grid-backend"}`
- `{container_name="grid-admin-backend"}`
- `{image_name="graph-ingestor"}`

## 2. Distributed Tracing (Tempo)

All significant operations are instrumented with OpenTelemetry.

### 2.1 Finding Traces
Find the most recent trace IDs to investigate request flows.

**Command:**
```powershell
curl.exe "http://localhost:3200/api/search?limit=5" | python -m json.tool
```

### 2.2 Inspecting a Trace
Get the full span details for a specific Trace ID.

**Command:**
```powershell
curl.exe "http://localhost:3200/api/traces/<TRACE_ID>" | python -m json.tool
```

## 3. Dynamic Telemetry Control

You can change log levels for specific modules without restarting the services.

### 3.1 Enabling DEBUG Mode
Modify `infra/telemetry_config.json`. The `TelemetryManager` in the backend polls this file every 10 seconds.

**Workflow:**
1. Read `infra/telemetry_config.json`.
2. Update the `overrides` for the module you are investigating (e.g., `"src.grid.display_rule_engine": "DEBUG"`).
3. Wait 10 seconds.
4. Trigger the issue and check logs via Loki or `docker compose logs`.

## 4. Debugging Recipes

### 4.1 "The Performance Leak"
1. Check Grafana (http://localhost:3000) for high latency in `/api/graph/topology`.
2. Find the Trace ID in Tempo for a slow request.
3. Identify the specific span (e.g., `Neo4j lookup`, `BFS Traversal`) that is taking the most time.

### 4.2 "The Transient Database Error"
1. Filter Loki for `IntegrityError` or `OperationalError`.
2. Look at the surrounding logs to see the sequence of operations.
3. Check the `trace_id` to correlate backend logs with Neo4j/DuckDB activity.

### 4.3 "The Startup Race"
1. Check Loki for `{container_name="grid-backend"}` at startup.
2. Look for "ServiceUnavailable" or connection retry logs.
