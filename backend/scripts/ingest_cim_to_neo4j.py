import os
import sys
import logging
import argparse
from pathlib import Path

from cimloader.databases import ConnectionParameters
from cimloader.databases.uploaders import Neo4jUploader

# Configure logging
# Setup logging to stdout so admin backend doesn't think it's an error
handler = logging.StreamHandler(sys.stdout)
handler.setLevel(logging.INFO)
formatter = logging.Formatter('%(levelname)s:%(name)s:%(message)s')
handler.setFormatter(formatter)
logging.basicConfig(level=logging.INFO, handlers=[handler])
logger = logging.getLogger(__name__)

def _process_file(path: Path, uploader: Neo4jUploader):
    """Internal helper to process a single CIM XML file."""
    # We need to tell n10s the path *inside* the container.
    # This script assumes the local 'backend/cim' is mounted to '/var/lib/neo4j/import/cim'.
    
    relative_path = ""
    try:
        # Try to make it relative to the 'cim' directory if possible
        if "cim" in path.parts:
            idx = path.parts.index("cim")
            relative_path = "cim/" + "/".join(path.parts[idx+1:])
        else:
            relative_path = path.name
    except Exception:
        relative_path = path.name

    container_filepath = "/var/lib/neo4j/import"
    if "/" in relative_path:
        parts = relative_path.split("/")
        filename = parts[-1]
        folder = "/".join(parts[:-1])
        full_folder = f"{container_filepath}/{folder}"
    else:
        filename = relative_path
        full_folder = container_filepath

    logger.info("Uploading %s from %s...", filename, full_folder)
    # format="RDF/XML" is standard for CIM XML
    uploader.upload(filepath=full_folder, filename=filename, format="RDF/XML")

def ingest_cim(xml_path: str, url: str, username: str, password: str, database: str):
    """
    Ingests a CIM XML file or directory of files into Neo4j using the cim-loader library.
    """
    path = Path(xml_path)
    if not path.exists():
        logger.error("Path not found: %s", xml_path)
        return

    params = ConnectionParameters(
        url=url,
        username=username,
        password=password,
        database=database,
        cim_profile="cimhub_2023",
        namespace="http://iec.ch/TC57/CIM100#"
    )

    uploader = Neo4jUploader(params)
    
    try:
        logger.info("Connecting to Neo4j at %s (DB: %s)...", url, database)
        try:
            logger.info("Configuring n10s graph config...")
            uploader.configure()
        except Exception as e:
            if "already initialized" in str(e) or "non-empty" in str(e) or "exists" in str(e):
                logger.info("Graph already configured or non-empty, skipping config.")
            else:
                logger.warning("Configuration warning: %s", str(e))
        
        if path.is_file():
            logger.info("Ingesting single file: %s", path.name)
            _process_file(path, uploader)
        elif path.is_dir():
            xml_files = sorted(list(path.glob("*.xml")))
            logger.info("Ingesting %d files from directory: %s", len(xml_files), path.name)
            for f in xml_files:
                logger.info("--- Processing: %s ---", f.name)
                _process_file(f, uploader)
        
        logger.info("Ingestion complete.")
    except Exception as e:
        logger.error("Ingestion failed: %s", str(e))
    finally:
        uploader.disconnect()

def main():
    parser = argparse.ArgumentParser(description="Ingest CIM XML into Neo4j using cim-loader and n10s.")
    parser.add_argument("xml_path", help="Path to the CIM XML file")
    parser.add_argument("--url", default=os.getenv("CIMG_URL", "bolt://localhost:7687"), help="Neo4j Bolt URL")
    parser.add_argument("--username", default=os.getenv("CIMG_USERNAME", "neo4j"), help="Neo4j Username")
    parser.add_argument("--password", default=os.getenv("CIMG_PASSWORD", "password123"), help="Neo4j Password")
    parser.add_argument("--database", default="neo4j", help="Target Neo4j database")

    args = parser.parse_args()
    
    # Force bolt://localhost:7687 if running from host but environment points to neo4j
    url = args.url
    if url == "bolt://neo4j:7687":
        url = "bolt://localhost:7687"

    ingest_cim(
        xml_path=args.xml_path,
        url=url,
        username=args.username,
        password=args.password,
        database=args.database
    )

if __name__ == "__main__":
    main()
