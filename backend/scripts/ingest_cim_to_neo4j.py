import os
import logging
import argparse
from pathlib import Path

from cimloader.databases import ConnectionParameters
from cimloader.databases.uploaders import Neo4jUploader

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def ingest_cim(xml_path: str, url: str, username: str, password: str, database: str):
    """
    Ingests a CIM XML file into Neo4j using the cim-loader library.
    Requires Neo4j to have the n10s (neosemantics) plugin installed.
    """
    path = Path(xml_path)
    if not path.exists():
        logger.error("XML file not found: %s", xml_path)
        return

    # In a Docker setup, Neo4j is typically accessed via its service name
    # and files are mounted into /var/lib/neo4j/import/.
    # This script assumes the local 'backend/cim' is mounted to '/var/lib/neo4j/import/cim'.
    
    # We need to tell n10s the path *inside* the container.
    # If the user provides a path like 'backend/cim/models/IEEE37.xml',
    # we convert it to '/var/lib/neo4j/import/cim/models/IEEE37.xml'.
    
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

    logger.info("Connecting to Neo4j at %s (DB: %s)...", url, database)
    
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
        logger.info("Configuring n10s graph config...")
        uploader.configure()
        
        logger.info("Uploading %s from %s...", filename, full_folder)
        # format="rdf_xml" is standard for CIM XML
        uploader.upload(filepath=full_folder, filename=filename, format="RDF/XML")
        
        logger.info("Ingestion complete for model: %s", path.name)
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
