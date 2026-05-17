import logging
import os
import time
from typing import List, Dict, Any, Optional
from neo4j import GraphDatabase
from neo4j.exceptions import ServiceUnavailable

logger = logging.getLogger(__name__)

class CimRepository:
    """Repository for querying the CIM graph in Neo4j."""

    def __init__(self):
        # Configuration read from environment
        self.url = os.getenv("CIMG_URL")
        self.username = os.getenv("CIMG_USERNAME", "neo4j")
        self.password = os.getenv("CIMG_PASSWORD", "password123")
        self.database = os.getenv("CIMG_DATABASE", "neo4j")

    def _get_driver(self):
        if not self.url:
            return None
        return GraphDatabase.driver(self.url, auth=(self.username, self.password))

    def discover_feeders(self, max_retries: int = 10) -> List[Dict[str, Any]]:
        """Query Neo4j for all Feeder nodes with resilient retries."""
        retry_delay = 2
        for attempt in range(max_retries):
            try:
                driver = self._get_driver()
                if not driver: return []
                
                with driver.session(database=self.database) as session:
                    rows = list(session.run(
                        "MATCH (f:Feeder) RETURN f.uri AS uri, f.`IdentifiedObject.name` AS name ORDER BY name"
                    ))
                driver.close()
                
                results = []
                for row in rows:
                    uri: str = row["uri"] or ""
                    feeder_mrid = uri.replace("urn:uuid:", "")
                    name = row["name"] or feeder_mrid
                    results.append({
                        "feeder_id": name,
                        "feeder_uri": feeder_mrid,
                    })
                return results

            except ServiceUnavailable as e:
                if attempt < max_retries - 1:
                    logger.info(f"Neo4j not ready. Retrying in {retry_delay}s... ({attempt + 1}/{max_retries})")
                    time.sleep(retry_delay)
                    retry_delay = min(retry_delay * 2, 10)
                else:
                    logger.error("Failed to connect to Neo4j after %d attempts.", max_retries)
                    raise e
        return []

    def get_feeder_coordinates(self, feeder_uri: str) -> List[Dict[str, Any]]:
        """Retrieves all coordinate points for a specific feeder."""
        query = """
        MATCH (f:Feeder {uri: $feeder_uri})
        MATCH (n)-[:`Equipment.EquipmentContainer`|MemberOf*0..10]-(f)
        MATCH (n)-[:`PowerSystemResource.Location`]->(loc:Location)-[:`Location.PositionPoints`]->(p:PositionPoint)
        RETURN n.`IdentifiedObject.mRID` as mrid, p.x as lon, p.y as lat, p.sequenceNumber as seq
        ORDER BY mrid, seq
        """
        driver = self._get_driver()
        if not driver: return []
        
        with driver.session(database=self.database) as session:
            rows = list(session.run(query, feeder_uri=feeder_uri))
        driver.close()
        return [dict(r) for r in rows]

    def resolve_node_to_feeder(self, node_id: str) -> Optional[Dict[str, Any]]:
        """Resolves a node ID to its containing feeder and identity."""
        query = """
        MATCH (n:Resource)
        WHERE n.`IdentifiedObject.mRID` = $node_id OR n.`IdentifiedObject.name` = $node_id
        OPTIONAL MATCH (n)-[:`Equipment.EquipmentContainer`|`ConnectivityNode.ConnectivityNodeContainer`|`Terminal.ConductingEquipment`|`Terminal.ConnectivityNode`|`PowerTransformerEnd.PowerTransformer`|`TransformerTank.PowerTransformer`|`TransformerTankEnd.TransformerTank`*0..8]-(f:Feeder)
        RETURN head(collect(DISTINCT f.`IdentifiedObject.name`)) AS feeder_id, n.`IdentifiedObject.mRID` AS mrid, n.`IdentifiedObject.name` AS name
        LIMIT 1
        """
        driver = self._get_driver()
        if not driver: return None
        
        with driver.session(database=self.database) as session:
            result = session.run(query, {"node_id": node_id}).single()
            if result:
                return {
                    "feeder_id": result["feeder_id"],
                    "mrid": result["mrid"],
                    "name": result["name"]
                }
        driver.close()
        return None

    def search_global(self, search_query: str, class_name: Optional[str] = None) -> List[Dict[str, Any]]:
        """Performs a global search across all feeders in Neo4j."""
        label_clause = f"AND any(lbl IN labels(n) WHERE toLower(lbl) CONTAINS toLower('{class_name}'))" if class_name else ""
        cypher = f"""
        MATCH (n:Resource)
        WHERE toLower(n.`IdentifiedObject.name`) CONTAINS toLower($query) {label_clause}
        WITH n LIMIT 50
        OPTIONAL MATCH (n)-[:`Equipment.EquipmentContainer`|`ConnectivityNode.ConnectivityNodeContainer`|`Terminal.ConductingEquipment`|`Terminal.ConnectivityNode`|`PowerTransformerEnd.PowerTransformer`|`TransformerTank.PowerTransformer`|`TransformerTankEnd.TransformerTank`*0..6]-(f:Feeder)
        RETURN
            n.`IdentifiedObject.mRID`      AS id,
            n.`IdentifiedObject.name`      AS name,
            [lbl IN labels(n) WHERE lbl <> 'Resource'][0] AS cim_type,
            head(collect(DISTINCT f.`IdentifiedObject.name`)) AS model_id
        """
        driver = self._get_driver()
        if not driver: return []
        
        results = []
        with driver.session(database=self.database) as session:
            for record in session.run(cypher, {"query": search_query}):
                mid = record["model_id"] or ""
                results.append({
                    "id": record["id"] or "",
                    "name": record["name"] or record["id"] or "",
                    "type": "equipment",
                    "model_id": mid,
                    "cim_type": record["cim_type"] or "Equipment"
                })
        driver.close()
        return results
