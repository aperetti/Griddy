#!/usr/bin/env python3
"""
Orchestrator to ingest and generate synthetic data for ALL models in sample_data.
"""
import os
import subprocess
import sys
from pathlib import Path

SCRIPT_PATH = Path(__file__).resolve()
BACKEND_DIR = SCRIPT_PATH.parents[1]
SAMPLE_DATA_DIR = BACKEND_DIR / "sample_data"

INGEST_SCRIPT = BACKEND_DIR / "scripts" / "ingest_cim_graph.py"
GENERATE_SCRIPT = BACKEND_DIR / "scripts" / "generate_cim_readings.py"

def run_step(cmd, env=None):
    print(f"\n>>> Executing: {cmd}")
    process = subprocess.Popen(
        cmd,
        shell=True,
        env={**os.environ, **(env or {})},
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding='utf-8',
        errors='replace'
    )
    for line in process.stdout:
        print(line, end="")
    process.wait()
    if process.returncode != 0:
        print(f"FAILED with return code {process.returncode}")
        return False
    return True

def main():
    if not SAMPLE_DATA_DIR.exists():
        print(f"Directory not found: {SAMPLE_DATA_DIR}")
        sys.exit(1)

    xml_files = sorted([f for f in SAMPLE_DATA_DIR.glob("*.xml")])
    if not xml_files:
        print("No .xml files found in sample_data.")
        sys.exit(0)

    print(f"Found {len(xml_files)} models to process.")

    # 1. Clean existing readings
    parquet_dir = BACKEND_DIR / "cim_readings"
    if parquet_dir.exists():
        print(f"\nCleaning existing readings in {parquet_dir}...")
        for f in parquet_dir.glob("*.parquet"):
            f.unlink()

    print(f"\n{'='*60}")
    print(" STARTING UNIFIED BULK GENERATION")
    print(f"{'='*60}")

    # Step 1: Ingest ALL models into SQLite
    print("\n[STEP 1/2] Ingesting all models into topology database...")
    if not run_step(f"python {INGEST_SCRIPT}"):
        print("Ingestion failed. Aborting.")
        sys.exit(1)

    # Step 2: Generate readings for ALL models from SQLite
    print("\n[STEP 2/2] Generating synthetic data for all models...")
    if not run_step(f"python {GENERATE_SCRIPT} --no-clean"):
        print("Generation failed. Aborting.")
        sys.exit(1)

    print(f"\n{'='*60}")
    print(" BULK GENERATION COMPLETE")
    print(f"{'='*60}")

if __name__ == "__main__":
    main()
