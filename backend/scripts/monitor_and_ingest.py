import os
import time
import shutil
import logging
import subprocess
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("grid-ingestor")

# Environment variables
INGEST_DIR = Path(os.getenv("INGEST_DIR", "/data/ingest"))
ARCHIVE_DIR = Path(os.getenv("ARCHIVE_DIR", "/data/archive"))
MODELS_DIR = Path(os.getenv("MODELS_DIR", "/app/cim/models"))
INGEST_SCRIPT = Path(os.getenv("INGEST_SCRIPT", "/app/scripts/ingest_cim_to_neo4j.py"))
POLL_INTERVAL = int(os.getenv("POLL_INTERVAL", "10"))

def ensure_dirs():
    """Ensure the necessary directories exist."""
    INGEST_DIR.mkdir(parents=True, exist_ok=True)
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

def process_file(file_path: Path):
    """Process a single CIM XML file."""
    logger.info(f"Processing new model: {file_path.name}")
    
    # 1. Copy to models directory (so CimModelRegistry sees it)
    target_model_path = MODELS_DIR / file_path.name
    logger.info(f"Copying to models directory: {target_model_path}")
    shutil.copy2(file_path, target_model_path)
    
    # 2. Ingest into Neo4j
    logger.info(f"Starting Neo4j ingestion for {file_path.name}...")
    try:
        # We run it as a subprocess to keep environments isolated and simple
        result = subprocess.run(
            ["python", str(INGEST_SCRIPT), str(target_model_path)],
            capture_output=True,
            text=True
        )
        
        if result.returncode == 0:
            logger.info(f"Successfully ingested {file_path.name} into Neo4j.")
            # 3. Move to archive
            archive_path = ARCHIVE_DIR / file_path.name
            logger.info(f"Moving {file_path.name} to archive: {archive_path}")
            shutil.move(str(file_path), str(archive_path))
            return True
        else:
            logger.error(f"Ingestion failed for {file_path.name}:\n{result.stderr}")
            return False
            
    except Exception as e:
        logger.error(f"Error during processing of {file_path.name}: {str(e)}")
        return False

def main():
    logger.info("Starting Grid Ingestor service...")
    logger.info(f"Monitoring: {INGEST_DIR}")
    logger.info(f"Archiving: {ARCHIVE_DIR}")
    
    ensure_dirs()
    
    while True:
        try:
            # Look for XML files in the ingest directory
            files = list(INGEST_DIR.glob("*.xml"))
            if files:
                logger.info(f"Found {len(files)} files to process.")
                for file_path in files:
                    process_file(file_path)
            
        except Exception as e:
            logger.error(f"Error in main loop: {str(e)}")
            
        time.sleep(POLL_INTERVAL)

if __name__ == "__main__":
    main()
