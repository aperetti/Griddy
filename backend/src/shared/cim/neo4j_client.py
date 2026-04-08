"""Neo4jClient — direct Neo4j driver wrapper.

All raw Cypher execution and node/neighbor lookups live here.
``CimModelManager`` delegates to this class; nothing else should import neo4j directly.
"""

import os
import logging
from typing import Any

logger = logging.getLogger(__name__)

_SKIP_LABELS = frozenset({
    "Resource", "IdentifiedObject", "PowerSystemResource", "Equipment",
    "ConductingEquipment", "Connector", "EnergyConnection",
})


def _cim_class(labels: list[str]) -> str:
    specific = [l for l in (labels or []) if l not in _SKIP_LABELS]
    return specific[0] if specific else (labels[0] if labels else "Object")


def _strip_uri(uri: str) -> str:
    for pfx in ("urn:uuid:", "_"):
        if uri.startswith(pfx):
            uri = uri[len(pfx):]
    return uri.upper()


class Neo4jClient:
    """Thin wrapper around the neo4j Python driver.

    Reads connection parameters from environment variables on every call so the
    process can pick up credential changes without restart.
    """

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _connection_params(self) -> tuple[str | None, str, str, str]:
        return (
            os.getenv("CIMG_URL"),
            os.getenv("CIMG_USERNAME", "neo4j"),
            os.getenv("CIMG_PASSWORD", ""),
            os.getenv("CIMG_DATABASE", "neo4j"),
        )

    # ── Public API ────────────────────────────────────────────────────────────

    def execute_cypher(self, query: str, params: dict = None) -> list[dict]:
        """Execute a parameterised Cypher query.

        Returns:
            List of result records (dicts), or [] if Neo4j is not configured or
            the query fails.
        """
        neo4j_url, username, password, database = self._connection_params()
        if not neo4j_url:
            logger.warning("execute_cypher: CIMG_URL not set, skipping.")
            return []

        from neo4j import GraphDatabase
        try:
            driver = GraphDatabase.driver(neo4j_url, auth=(username, password))
            with driver.session(database=database) as session:
                # 15-second wall-clock timeout — prevents slow classification queries
                # from hanging the topology endpoint indefinitely.
                result = session.run(query, **(params or {}), timeout=15)
                records = [dict(r) for r in result]
            driver.close()
            return records
        except Exception as e:
            logger.error("execute_cypher failed: %s", e)
            return []

    def get_node_properties(self, target_id: str) -> dict | None:
        """Return all Neo4j properties for any node by mRID.

        Works for any node type regardless of in-memory model coverage.
        Returns None if the node is not found or Neo4j is unavailable.
        """
        neo4j_url, username, password, database = self._connection_params()
        if not neo4j_url:
            return None

        uuid_lower = target_id.lower()
        uuid_upper = target_id.upper()
        uri_variants = [f"urn:uuid:{uuid_lower}", f"urn:uuid:{uuid_upper}"]

        query = """
MATCH (n) WHERE n.uri IN $uris
RETURN properties(n) AS props, labels(n) AS lbls
LIMIT 1
"""
        from neo4j import GraphDatabase
        try:
            driver = GraphDatabase.driver(neo4j_url, auth=(username, password))
            with driver.session(database=database) as session:
                rows = list(session.run(query, uris=uri_variants))
            driver.close()
        except Exception as e:
            logger.error("get_node_properties Neo4j query failed: %s", e)
            return None

        if not rows:
            return None

        raw: dict = dict(rows[0]["props"])
        lbls: list[str] = rows[0]["lbls"] or []

        cim_class = _cim_class(lbls)

        raw_uri = raw.pop("uri", None) or ""
        mrid = raw_uri.replace("urn:uuid:", "").upper() or target_id

        props: dict[str, Any] = {"mrid": mrid, "cim_type": cim_class}
        props.update(raw)
        return props

    def get_neighbors(self, target_id: str) -> dict | None:
        """Return all immediate CIM graph neighbors for any node.

        Traverses both outgoing and incoming relationships.
        Returns None if the node is not found or Neo4j is unavailable.
        """
        neo4j_url, username, password, database = self._connection_params()
        if not neo4j_url:
            return None

        uri_variants = [
            f"urn:uuid:{target_id.lower()}",
            f"urn:uuid:{target_id.upper()}",
        ]

        q_outgoing = """
MATCH (n)-[r]->(nb)
WHERE n.uri IN $uris AND nb.uri IS NOT NULL
RETURN
    n.uri AS root_uri,
    coalesce(n.`IdentifiedObject.name`, '') AS root_name,
    labels(n)  AS root_labels,
    type(r)    AS relation,
    nb.uri     AS nb_uri,
    coalesce(nb.`IdentifiedObject.name`, '') AS nb_name,
    labels(nb) AS nb_labels
"""
        q_incoming = """
MATCH (nb)-[r]->(n)
WHERE n.uri IN $uris AND nb.uri IS NOT NULL
RETURN
    n.uri AS root_uri,
    coalesce(n.`IdentifiedObject.name`, '') AS root_name,
    labels(n)  AS root_labels,
    type(r)    AS relation,
    nb.uri     AS nb_uri,
    coalesce(nb.`IdentifiedObject.name`, '') AS nb_name,
    labels(nb) AS nb_labels
"""
        from neo4j import GraphDatabase
        try:
            driver = GraphDatabase.driver(neo4j_url, auth=(username, password))
            with driver.session(database=database) as session:
                rows = (
                    list(session.run(q_outgoing, uris=uri_variants))
                    + list(session.run(q_incoming, uris=uri_variants))
                )
            driver.close()
        except Exception as e:
            logger.error("get_neighbors Neo4j query failed: %s", e)
            return None

        if not rows:
            return None

        first = rows[0]
        root_mrid = _strip_uri(first["root_uri"])
        root_name = first["root_name"] or root_mrid[:12]
        root_cim_class = _cim_class(first["root_labels"])

        seen: set[str] = {root_mrid}
        neighbors = []
        for row in rows:
            nb_uri = row["nb_uri"]
            if not nb_uri:
                continue
            nb_mrid = _strip_uri(nb_uri)
            if nb_mrid in seen:
                continue
            seen.add(nb_mrid)
            nb_class = _cim_class(row["nb_labels"])
            nb_name = row["nb_name"] or nb_mrid[:12]
            neighbors.append({
                "id": nb_mrid,
                "cim_class": nb_class,
                "type": nb_class,
                "name": nb_name,
                "relation": row["relation"],
            })

        return {
            "id": root_mrid,
            "cim_class": root_cim_class,
            "type": root_cim_class,
            "name": root_name,
            "neighbors": neighbors,
        }
