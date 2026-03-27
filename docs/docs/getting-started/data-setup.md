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

## 3. Automated Model Ingestion (Hot-loading)

The project includes an automated ingestion service that monitors a folder for new CIM XML models and "hot-loads" them into Neo4j and the grid-map UI.

### Using the Ingestor:
1.  **Drop XML File**: Place your CIM XML file into the `ingest/` directory in the project root.
2.  **Wait for Processing**: The `grid-ingestor` service will:
    *   Register the model in the backend (`backend/cim/models/`).
    *   Ingest the data into a dedicated Neo4j database named after the file.
    *   Move the original file to the `archive/` directory upon completion.
3.  **Toggle Layers**: Open the Grid-Map UI and use the **Layers** panel to enable the new model.

### Monitoring Progress:
You can watch the ingestion logs using Docker:
```bash
docker compose logs -f ingestor
```

## 4. Ingesting a CIM Model (Manual/Local)

If you prefer to load a model manually without the automated service, place it in the `backend/cim/models/` directory.

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
