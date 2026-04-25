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
MODELS_DIR = BACKEND_DIR / "cim" / "models"

INGEST_SCRIPT = BACKEND_DIR / "scripts" / "ingest_cim_to_neo4j.py"

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
    if not MODELS_DIR.exists():
        print(f"Directory not found: {MODELS_DIR}")
        sys.exit(1)

    xml_files = sorted([f for f in MODELS_DIR.glob("*.xml")])
    if not xml_files:
        print("No .xml files found in cim/models.")
        sys.exit(0)

    print(f"Found {len(xml_files)} models to process.")

    print(f"\n{'='*60}")
    print(" STARTING UNIFIED BULK INGESTION")
    print(f"{'='*60}")

    # Step 1: Ingest ALL models into Neo4j
    print("\n[STEP 1/1] Ingesting all models into Neo4j...")
    # Passing the directory to ingest_cim_to_neo4j.py works as it scans for *.xml
    if not run_step(f"python {INGEST_SCRIPT} {MODELS_DIR}"):
        print("Ingestion failed. Aborting.")
        sys.exit(1)

    print(f"\n{'='*60}")
    print(" BULK INGESTION COMPLETE")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
