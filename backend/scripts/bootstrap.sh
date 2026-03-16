#!/bin/bash
set -e

# Data directory
mkdir -p /data

echo "Starting dedicated data generation..."

# Ensure PYTHONPATH is set so scripts can find src if needed
export PYTHONPATH=$PYTHONPATH:/app

echo "--- Debug Environment ---"
python --version
pip --version
pip list | grep cim
echo "-------------------------"

echo "1. Ingesting CIM model with CIM-Graph into SQLite..."
python /app/scripts/ingest_cim_graph.py

echo "2. Ingesting weather data..."
python /app/scripts/ingest_weather.py

echo "3. Generating synthetic readings (weather-aware)..."
python /app/scripts/generate_cim_readings.py

echo "Data generation complete."
