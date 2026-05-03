#!/bin/bash
set -e

# Data directory
mkdir -p /data /data/config

# Bootstrapping logic
if [ "$BOOTSTRAP_DATA" = "true" ]; then
    if [ -f "$DB_PATH" ]; then
        echo "CIM database already exists at $DB_PATH. Skipping bootstrapping."
    else
        echo "CIM database not found. Starting data bootstrapping..."
        
        # Check if CIM model exists
        if [ -f "$CIM_MODEL_PATH" ]; then
            echo "Ingesting CIM model from $CIM_MODEL_PATH..."
            # We need to set PYTHONPATH so ingest_cim.py can find src
            export PYTHONPATH=$PYTHONPATH:/app
            python scripts/ingest_cim.py
            
            echo "Ingesting weather data..."
            python scripts/ingest_weather.py

            echo "Generating synthetic readings (weather-aware)..."
            python scripts/generate_cim_readings.py
            
            echo "Bootstrapping complete."
        else
            echo "WARNING: CIM model not found at $CIM_MODEL_PATH. Skipping ingestion."
        fi
    fi
fi

# Start the application
echo "Starting FastAPI server..."
# Use exec to forward signals correctly. Allow additional args like --reload.
exec uvicorn main:app --host "$HOST" --port "$PORT" "$@"
