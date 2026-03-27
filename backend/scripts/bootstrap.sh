#!/bin/bash
set -e

# Data directory
mkdir -p /data

echo "Starting dedicated data generation..."

if [ "$REFRESH_DB" = "true" ]; then
    echo "!!! REFRESH_DB=true detected. Clearing all database and parquet files !!!"
    # Clear DuckDB and SQLite files in /data
    rm -f /data/*.duckdb /data/*.sqlite /data/*.db
    # Clear Parquet directories
    rm -rf /data/cim_readings/*
    rm -rf /data/cim_alarms/*
    echo "Cleanup complete. Starting from a fresh state."
fi

# Ensure PYTHONPATH is set so scripts can find src if needed
export PYTHONPATH=$PYTHONPATH:/app

echo "--- Debug Environment ---"
python --version
pip --version
pip list | grep cim
echo "-------------------------"

echo "2. Ingesting CIM model with CIM-Graph into Neo4j..."
python /app/scripts/ingest_cim_to_neo4j.py "$CIM_MODEL_PATH"

echo "3. Ingesting weather data..."
python /app/scripts/ingest_weather.py

echo "3. Generating synthetic readings (weather-aware)..."
python /app/scripts/generate_cim_readings.py

echo "Data generation complete."
