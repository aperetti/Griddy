# Data Setup

Before the app can display anything useful, you need to generate or ingest a grid model and time-series readings.

## 1. Automated Bootstrapping

When running through Docker, the bootstrapping process is controlled by the `BOOTSTRAP_DATA` environment variable. If set to `true`, the backend will search for a CIM model in the `cim/` directory and generate synthetic readings on startup.

## 2. Dedicated Data Generator (Recommended)

For more control or to re-run generation without restarting the backend, use the dedicated `generator` service via the `tools` profile.

### Running Generation
To trigger a full data generation cycle (ingest model, weather, and readings):

```bash
docker-compose --profile tools run --rm generator
```

### Refreshing Data
If you want to clear existing data and start from a fresh state, use the `REFRESH_DB` environment variable:

```bash
docker-compose --profile tools run --rm -e REFRESH_DB=true generator
```

## 3. Ingesting a CIM Model (Manual/Local)

If you have a customized CIM XML file (e.g., IEEE 13-node, 8500-node, or a custom utility model), place it in the `backend/cim/` directory.

To trigger the ingestion manually, run the following command from the `backend/` directory:

```bash
# Ingest the CIM graph into DuckDB
python scripts/ingest_cim_graph.py
```

This script extracts the topology, device metadata, and connectivity from the XML model and populates the `grid_data_cim.duckdb` file.

## 3. Generating Synthetic Readings

If you don't have real AMI readings, you can generate synthetic ones based on the grid model and a weather profile:

```bash
# Ingest weather data (EPW format)
python scripts/ingest_weather.py

# Generate time-series readings for all meters
python scripts/generate_cim_readings.py
```

Generating readings for the full 8500-node model can take several minutes. The output is stored in **Parquet format** in the `backend/data/cim_readings/` directory to ensure high-performance analytical queries.

## 4. Troubleshooting

If your map appears empty:
1.  Check that the `grid_topology.sqlite` and `grid_data_cim.duckdb` files exist in the `backend/data/` or `backend/` root.
2.  Verify the `DB_PATH` and `PARQUET_DIR` environment variables match your file locations.
3.  Restart the backend service to refresh the in-memory graph cache.
