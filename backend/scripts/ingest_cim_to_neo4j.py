import os
import logging
import asyncio
import argparse
from pathlib import Path
from typing import Any, Dict, List

import cimgraph.data_profile.cimhub_2023 as cim
from neo4j import AsyncGraphDatabase
from cimgraph.databases import XMLFile
from cimgraph.models import FeederModel

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Classes to ensure are loaded from XML
CIM_CLASSES = [
    cim.Feeder,
    cim.ConnectivityNode,
    cim.Terminal,
    cim.PowerTransformer,
    cim.PowerTransformerEnd,
    cim.TransformerTank,
    cim.TransformerTankEnd,
    cim.TransformerTankInfo,
    cim.TransformerEndInfo,
    cim.PowerTransformerInfo,
    cim.ACLineSegment,
    cim.ACLineSegmentPhase,
    cim.Fuse,
    cim.Breaker,
    cim.LoadBreakSwitch,
    cim.Disconnector,
    cim.Recloser,
    cim.EnergyConsumer,
    cim.EnergySource,
    cim.LinearShuntCompensator,
    cim.Asset,
    cim.AssetInfo,
    cim.BaseVoltage,
    cim.ConnectivityNodeContainer,
    cim.VoltageLevel,
    cim.Substation,
    cim.Bay,
]

class CIMNeo4jIngestor:
    def __init__(
        self,
        url: str = "bolt://localhost:7687",
        username: str = "neo4j",
        password: str = "password123",
        database: str = "neo4j",
        profile: str = "cimhub_2023"
    ):
        self.url = url
        self.username = username
        self.password = password
        self.database = database
        self.profile = profile
        self.driver = AsyncGraphDatabase.driver(url, auth=(username, password))

    async def upload_to_neo4j(self, model: FeederModel, model_id: str):
        """Uploads a FeederModel to Neo4j."""
        logger.info("Connecting to Neo4j at %s (DB: %s)...", self.url, self.database)
        
        try:
            async with self.driver.session(database=self.database) as session:
                # 1. Clear existing data for this model
                logger.info("Clearing existing data in database '%s'...", self.database)
                await session.run("MATCH (n) DETACH DELETE n")

                # 2. Extract all objects from the graph
                all_objects = []
                for cls_type, objs in model.graph.items():
                    for mrid, obj in objs.items():
                        all_objects.append((cls_type, mrid, obj))

                logger.info("Found %d objects to upload.", len(all_objects))

                # 3. Create Nodes
                nodes_data = []
                for cls_type, mrid, obj in all_objects:
                    props = {
                        "mRID": mrid,
                        "model_id": model_id,
                        "cim_class": cls_type.__name__
                    }
                    
                    # Extract primitive attributes
                    if hasattr(obj, "__dataclass_fields__"):
                        for attr in obj.__dataclass_fields__:
                            if attr in ("mRID", "name"): continue
                            val = getattr(obj, attr, None)
                            if isinstance(val, (str, int, float, bool)):
                                props[attr] = val
                            elif hasattr(val, "value"): # Enums
                                props[attr] = str(val.value)
                    
                    name = getattr(obj, "name", None)
                    if name: props["name"] = name
                    nodes_data.append({"mrid": mrid, "labels": [cls_type.__name__, "CIMObject"], "props": props})

                logger.info("Uploading nodes...")
                by_label = {}
                for n in nodes_data:
                    label = n["labels"][0]
                    if label not in by_label: by_label[label] = []
                    by_label[label].append(n["props"])

                for label, batch in by_label.items():
                    query = f"UNWIND $batch AS props CREATE (n:{label}:CIMObject) SET n = props"
                    await session.run(query, batch=batch)
                
                await session.run("CREATE INDEX mrid_idx IF NOT EXISTS FOR (n:CIMObject) ON (n.mRID)")

                # 4. Create Relationships
                logger.info("Uploading relationships...")
                rels_data = []
                for cls_type, mrid, obj in all_objects:
                    if hasattr(obj, "__dataclass_fields__"):
                        for attr, field in obj.__dataclass_fields__.items():
                            val = getattr(obj, attr, None)
                            if val is None: continue
                            
                            if isinstance(val, list):
                                for item in val:
                                    item_mrid = getattr(item, "mRID", None)
                                    if item_mrid:
                                        rels_data.append({"start": mrid, "end": item_mrid, "type": attr})
                            else:
                                item_mrid = getattr(val, "mRID", None)
                                if item_mrid:
                                    rels_data.append({"start": mrid, "end": item_mrid, "type": attr})

                by_rel_type = {}
                for r in rels_data:
                    t = r["type"]
                    if t not in by_rel_type: by_rel_type[t] = []
                    by_rel_type[t].append(r)

                for rel_type, batch in by_rel_type.items():
                    sanitized_type = rel_type.replace(".", "_")
                    query = f"""
                    UNWIND $batch AS r
                    MATCH (a:CIMObject {{mRID: r.start}}), (b:CIMObject {{mRID: r.end}})
                    CREATE (a)-[:{sanitized_type}]->(b)
                    """
                    await session.run(query, batch=batch)

                logger.info("Ingestion complete for database '%s'.", self.database)
        finally:
            await self.driver.close()

    def ingest(self, xml_path: str):
        path = Path(xml_path)
        logger.info("Loading CIM XML: %s", path.name)
        xml_file = XMLFile(filename=str(path))
        model = FeederModel(container=cim.Feeder(), connection=xml_file, profile_name=self.profile)

        logger.info("Fetching attributes for all mapped classes...")
        for cls in CIM_CLASSES:
            model.get_all_attributes(cls)

        asyncio.run(self.upload_to_neo4j(model, path.stem))

def main():
    parser = argparse.ArgumentParser(description="Ingest CIM XML into Neo4j using cimgraph.")
    parser.add_argument("xml_path", help="Path to the CIM XML file")
    parser.add_argument("--url", default=os.getenv("CIMG_URL", "bolt://localhost:7687"), help="Neo4j Bolt URL")
    parser.add_argument("--username", default=os.getenv("CIMG_USERNAME", "neo4j"), help="Neo4j Username")
    parser.add_argument("--password", default=os.getenv("CIMG_PASSWORD", "password123"), help="Neo4j Password")
    parser.add_argument("--database", help="Target Neo4j database (defaults to model file name)")
    parser.add_argument("--profile", default=os.getenv("CIMG_CIM_PROFILE", "cimhub_2023"), help="CIM profile name")

    args = parser.parse_args()
    
    xml_file = Path(args.xml_path)
    if not xml_file.exists():
        print(f"Error: XML file not found: {args.xml_path}")
        return

    db_name = args.database or xml_file.stem
    
    ingestor = CIMNeo4jIngestor(
        url=args.url,
        username=args.username,
        password=args.password,
        database=db_name,
        profile=args.profile
    )
    
    ingestor.ingest(args.xml_path)

if __name__ == "__main__":
    main()
