"""
Ingest CIM XML files into Neo4j using n10s (neosemantics) directly.

After importing, runs a post-process step that casts all string-stored
numeric properties to their correct Neo4j types (float/integer) using the
type information from the installed cimgraph CIM profile.

CIM XML files do not include rdf:datatype on literal values, so n10s
stores everything as strings.  The profile dataclasses are the authoritative
source for which properties are float vs int, so we derive the cast list
from them rather than maintaining it by hand.
"""
import os
import sys
import logging
import argparse
import dataclasses
import inspect
from pathlib import Path
from typing import get_type_hints

from neo4j import GraphDatabase

handler = logging.StreamHandler(sys.stdout)
handler.setLevel(logging.INFO)
logging.basicConfig(level=logging.INFO, handlers=[handler],
                    format='%(levelname)s:%(name)s:%(message)s')
logger = logging.getLogger(__name__)

_N10S_CONFIG = {
    "handleVocabUris": "IGNORE",
    "handleRDFTypes": "LABELS",
    "handleMultival": "OVERWRITE",
    "keepCustomDataTypes": True,
}

_NUMERIC_PATTERN = r"^-?[0-9]+\.?[0-9]*([eE][+-]?[0-9]+)?$"


def _get_numeric_props_from_profile(cim_profile: str) -> tuple[list[str], list[str]]:
    """Return (float_props, int_props) derived from the installed CIM profile.

    Each entry is 'ClassName.propertyName' matching the n10s property key format.
    """
    try:
        from cimgraph.data_profile import cimhub_2023, rc4_2021
        profile_map = {"cimhub_2023": cimhub_2023, "rc4_2021": rc4_2021}
        profile = profile_map.get(cim_profile, cimhub_2023)
    except ImportError:
        logger.warning("cimgraph not available — skipping profile-driven type cast")
        return [], []

    float_props, int_props = [], []

    for cls_name, cls in inspect.getmembers(profile, inspect.isclass):
        if not dataclasses.is_dataclass(cls):
            continue
        for f in dataclasses.fields(cls):
            ann = str(cls.__annotations__.get(f.name, ""))
            key = f"{cls_name}.{f.name}"
            if "float" in ann:
                float_props.append(key)
            elif "Optional[int]" in ann or ann == "int":
                int_props.append(key)

    return float_props, int_props


def _cast_numeric_properties(session, cim_profile: str) -> None:
    """Cast string-stored CIM numeric properties to Neo4j float/integer."""
    float_props, int_props = _get_numeric_props_from_profile(cim_profile)
    logger.info("Casting %d float and %d int properties from CIM profile %s...",
                len(float_props), len(int_props), cim_profile)

    total_cast = 0
    for prop in float_props:
        label = prop.split(".")[0]
        result = session.run(
            f"MATCH (n:`{label}`) "
            f"WHERE n.`{prop}` IS NOT NULL AND toString(n.`{prop}`) =~ $pat "
            f"SET n.`{prop}` = toFloat(n.`{prop}`) "
            f"RETURN count(n) AS cnt",
            pat=_NUMERIC_PATTERN,
        )
        cnt = result.single()["cnt"]
        if cnt:
            total_cast += cnt

    for prop in int_props:
        label = prop.split(".")[0]
        result = session.run(
            f"MATCH (n:`{label}`) "
            f"WHERE n.`{prop}` IS NOT NULL AND toString(n.`{prop}`) =~ $pat "
            f"SET n.`{prop}` = toInteger(n.`{prop}`) "
            f"RETURN count(n) AS cnt",
            pat=r"^-?[0-9]+$",
        )
        cnt = result.single()["cnt"]
        if cnt:
            total_cast += cnt

    logger.info("  cast %d property values to numeric types.", total_cast)


def _configure_n10s(session) -> None:
    """Initialise n10s graph config. Safe to call on an already-configured graph."""
    try:
        session.run("CALL n10s.graphconfig.init($cfg)", cfg=_N10S_CONFIG)
        logger.info("n10s configured.")
    except Exception as e:
        msg = str(e).lower()
        if "non-empty" in msg or "already" in msg or "exists" in msg:
            logger.info("n10s already configured, skipping.")
        else:
            logger.warning("n10s configure warning: %s", e)

    try:
        session.run(
            "CREATE CONSTRAINT n10s_unique_uri IF NOT EXISTS "
            "FOR (r:Resource) REQUIRE r.uri IS UNIQUE"
        )
    except Exception as e:
        if "already exists" not in str(e).lower():
            logger.warning("Constraint warning: %s", e)


def _import_file(session, container_path: str) -> None:
    """Import a single CIM RDF/XML file via n10s."""
    file_url = f"file:///{container_path.lstrip('/')}"
    logger.info("Importing %s", file_url)
    result = session.run(
        "CALL n10s.rdf.import.fetch($url, 'RDF/XML')",
        url=file_url,
    )
    summary = result.single()
    if summary:
        logger.info("  triplesLoaded=%s status=%s",
                    summary.get("triplesLoaded"), summary.get("terminationStatus"))


def _to_container_path(path: Path) -> str:
    """Convert a host path to the container-mounted path under /var/lib/neo4j/import."""
    parts = path.parts
    if "cim" in parts:
        idx = parts.index("cim")
        rel = "/".join(parts[idx:])
        return f"/var/lib/neo4j/import/{rel}"
    return f"/var/lib/neo4j/import/{path.name}"


def ingest_cim(xml_path: str, url: str, username: str, password: str,
               database: str, cim_profile: str) -> None:
    path = Path(xml_path)
    if not path.exists():
        logger.error("Path not found: %s", xml_path)
        return

    driver = GraphDatabase.driver(url, auth=(username, password))
    try:
        with driver.session(database=database) as session:
            _configure_n10s(session)

            if path.is_file():
                _import_file(session, _to_container_path(path))
            elif path.is_dir():
                xml_files = sorted(path.glob("*.xml"))
                logger.info("Found %d XML files in %s", len(list(xml_files)), path)
                for f in sorted(path.glob("*.xml")):
                    _import_file(session, _to_container_path(f))

            _cast_numeric_properties(session, cim_profile)

        logger.info("Ingestion complete.")
    except Exception as e:
        logger.error("Ingestion failed: %s", e)
        raise
    finally:
        driver.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Ingest CIM XML into Neo4j via n10s."
    )
    parser.add_argument("xml_path", help="CIM XML file or directory")
    parser.add_argument("--url",         default=os.getenv("CIMG_URL", "bolt://localhost:7687"))
    parser.add_argument("--username",    default=os.getenv("CIMG_USERNAME", "neo4j"))
    parser.add_argument("--password",    default=os.getenv("CIMG_PASSWORD", "password123"))
    parser.add_argument("--database",    default="neo4j")
    parser.add_argument("--cim-profile", default=os.getenv("CIMG_CIM_PROFILE", "cimhub_2023"),
                        dest="cim_profile")
    args = parser.parse_args()

    url = args.url
    if url == "bolt://neo4j:7687":
        url = "bolt://localhost:7687"

    ingest_cim(args.xml_path, url, args.username, args.password,
               args.database, args.cim_profile)


if __name__ == "__main__":
    main()
