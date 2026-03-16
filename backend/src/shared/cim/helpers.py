"""Pure utility functions shared across the CIM package."""

from typing import Optional


def _mrid_str(obj) -> Optional[str]:
    if obj is None:
        return None
    m = getattr(obj, "mRID", None)
    if m is None:
        return None
    s = str(m)
    for prefix in ("urn:uuid:", "_"):
        if s.startswith(prefix):
            s = s[len(prefix):]
    return s.upper()


def _get_name(obj) -> str:
    name = getattr(obj, "name", None)
    return name if name else (_mrid_str(obj) or "Unknown")


def _safe_float(val) -> Optional[float]:
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def _parse_phase_code(phase_code) -> Optional[list[str]]:
    """Convert CIM PhaseCode enum to list of phase strings."""
    if phase_code is None:
        return None
    pc_str = str(phase_code)
    # Handle enum-style: PhaseCode.ABC, PhaseCode.A, etc.
    if "." in pc_str:
        pc_str = pc_str.split(".")[-1]
    if pc_str in ("none", "None", "NONE", ""):
        return None
    # Split-phase handling
    if "s" in pc_str.lower():
        phases = []
        if "s1" in pc_str.lower():
            phases.append("S1")
        if "s2" in pc_str.lower():
            phases.append("S2")
        for c in pc_str.upper():
            if c in ("A", "B", "C", "N") and c not in phases:
                phases.append(c)
        return phases if phases else None
    # Standard phases
    phases = [c for c in pc_str.upper() if c in ("A", "B", "C", "N")]
    return phases if phases else None
