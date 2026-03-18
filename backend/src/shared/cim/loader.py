"""Path resolution and manual XML catalog scanning for CIM models."""

import os
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# ── Path constants (Robust detected root) ─────────────────────────
_THIS_DIR = Path(__file__).resolve().parent
if _THIS_DIR.name == "cim" and _THIS_DIR.parent.name == "shared":
    _BACKEND_DIR = _THIS_DIR.parents[2] # backend/
else:
    _BACKEND_DIR = Path.cwd()

_WORKSPACE_ROOT = _BACKEND_DIR.parent

# CIM-Graph environment vars (must be set before importing cimgraph)
os.environ.setdefault("CIMG_CIM_PROFILE", "rc4_2021")
os.environ.setdefault("CIMG_IEC61970_301", "8")


def _resolve_xml_path(xml_path: Optional[str] = None) -> Path:
    """Resolve CIM XML file path from an explicit path, env var, or known project locations."""
    
    # 1. Explicit path (highest priority)
    if xml_path:
        p = Path(xml_path)
        if p.is_absolute() and p.is_file():
            return p
        if (_BACKEND_DIR / p).is_file():
            return _BACKEND_DIR / p
        if p.is_file():
            return p

    # 2. Environment variable
    env_xml = os.getenv("CIM_MODEL_PATH")
    if env_xml:
        p = Path(env_xml)
        if p.is_absolute() and p.is_file():
            return p
        if (_BACKEND_DIR / p).is_file():
            return _BACKEND_DIR / p
        if p.is_file():
            return p

    # 3. Known candidates
    candidates = [
        _BACKEND_DIR / "cim" / "IEEE8500_3subs.xml",
        _BACKEND_DIR / "cim" / "IEEE8500.xml",
        Path("/app/cim/IEEE8500.xml"), # Docker location
        Path("/app/IEEE8500.xml"),             # Alternative Docker location
    ]
    for c in candidates:
        if c.is_file():
            return c



def _manual_xml_catalog_scan(path: Path) -> tuple[dict, dict]:
    """Streaming parse of CIM XML to find transformer tank/info linkages.

    Returns:
        (tank_to_info, info_to_kva) — dicts mapping mRIDs to linked mRIDs / kVA ratings.
    """
    import xml.etree.ElementTree as ET

    tank_to_info: dict[str, str] = {}
    info_to_kva: dict[str, float] = {}

    logger.info("  [Manual Scan] Scanning %s for linkages...", path.name)

    try:
        context = ET.iterparse(str(path), events=("start", "end"))
        _, root = next(context)

        curr_tank_mrid = None
        curr_end_info_mrid = None
        tank_count = 0

        for event, elem in context:
            tag = elem.tag.split("}")[-1]  # Remove namespace

            if event == "start":
                if tag == "TransformerTank":
                    m = (
                        elem.get("{http://www.w3.org/1999/02/22-rdf-syntax-ns#}ID")
                        or elem.get("{http://www.w3.org/1999/02/22-rdf-syntax-ns#}about")
                    )
                    if m:
                        if m.startswith("urn:uuid:"):
                            m = m[9:]
                        curr_tank_mrid = m.upper()
                elif tag == "TransformerEndInfo":
                    m = (
                        elem.get("{http://www.w3.org/1999/02/22-rdf-syntax-ns#}ID")
                        or elem.get("{http://www.w3.org/1999/02/22-rdf-syntax-ns#}about")
                    )
                    if m:
                        if m.startswith("urn:uuid:"):
                            m = m[9:]
                        curr_end_info_mrid = m.upper()

            elif event == "end":
                if tag == "TransformerTank.TransformerTankInfo":
                    res = elem.get("{http://www.w3.org/1999/02/22-rdf-syntax-ns#}resource")
                    if curr_tank_mrid and res:
                        if res.startswith("urn:uuid:"):
                            res = res[9:]
                        tank_to_info[curr_tank_mrid] = res.upper()
                        tank_count += 1
                elif tag == "TransformerEndInfo.ratedS":
                    if curr_end_info_mrid and elem.text:
                        try:
                            info_to_kva[curr_end_info_mrid] = float(elem.text)
                        except (ValueError, TypeError):
                            pass
                elif tag == "TransformerEndInfo.TransformerTankInfo":
                    res = elem.get("{http://www.w3.org/1999/02/22-rdf-syntax-ns#}resource")
                    if curr_end_info_mrid and res:
                        if res.startswith("urn:uuid:"):
                            res = res[9:]
                        kva = info_to_kva.get(curr_end_info_mrid)
                        if kva:
                            # Map rating from EndInfo to TankInfo mRID
                            info_to_kva[res.upper()] = kva

                if tag == "TransformerTank":
                    curr_tank_mrid = None
                if tag == "TransformerEndInfo":
                    curr_end_info_mrid = None

                root.clear()  # Memory optimisation

        logger.info(
            "  [Manual Scan] Completed: %d tank links, %d ratings found",
            tank_count,
            len(info_to_kva),
        )
    except Exception as e:
        logger.error("  [Manual Scan] Failed: %s", e)

    return tank_to_info, info_to_kva
