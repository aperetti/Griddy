"""
CIM Property Mapping — display labels and scale factors.

Used by apply_mappings() to compute virtual/derived display properties for
CIM objects held in memory. The Cypher rule builder no longer uses this for
query generation (it uses generic EXISTS traversal instead).
"""
from typing import Any, Dict

# Default mappings shared across multiple CIM classes
DEFAULT_MAPPINGS = {
    "name":        {"attribute": "IdentifiedObject.name",        "label": "Name"},
    "mrid":        {"attribute": "IdentifiedObject.mRID",        "label": "mRID"},
    "description": {"attribute": "IdentifiedObject.description", "label": "Description"},
}

# Display-label and optional scale factor per class/property.
# No rel_path or rel_path_or entries — Cypher generation uses generic EXISTS traversal.
CIM_PROPERTY_MAP: Dict[str, Dict[str, Any]] = {
    "PowerTransformer": {
        "ratedS":     {"attribute": "PowerTransformerEnd.ratedS",  "label": "Rated Power (VA)"},
        "rating":     {"attribute": "PowerTransformerEnd.ratedS",  "label": "Rating (VA)"},
        "voltage_kv": {"attribute": "PowerTransformerEnd.ratedU",  "label": "Rated Voltage (V)"},
    },
    "EnergyConsumer": {
        "p_mw":   {"attribute": "EnergyConsumer.p", "scale": 1e6,    "label": "Active Power (MW)"},
        "q_mvar": {"attribute": "EnergyConsumer.q", "scale": 1e6,    "label": "Reactive Power (MVAr)"},
        "rating": {"attribute": "EnergyConsumer.p", "scale": 1000.0, "label": "Rating (kVA)"},
        "ratedS": {"attribute": "EnergyConsumer.p", "scale": 1000.0, "label": "Rated Power (kVA)"},
    },
    "ACLineSegment": {
        "length_m": {"attribute": "ACLineSegment.length", "label": "Length (m)"},
        "r":        {"attribute": "ACLineSegment.r",      "label": "Resistance (Ohm)"},
        "x":        {"attribute": "ACLineSegment.x",      "label": "Reactance (Ohm)"},
    },
    "Switch": {
        "is_open": {"attribute": "Switch.normalOpen", "type": "boolean", "label": "Normally Open"},
    },
}

# List of base classes and their common subclasses to include in rule matching.
CIM_BASE_CLASSES: Dict[str, list] = {
    "Switch":               ["Switch", "LoadBreakSwitch", "Fuse", "Breaker", "Disconnector", "Sectionaliser", "Recloser"],
    "PowerTransformer":     ["PowerTransformer", "Transformer"],
    "ConductingEquipment":  ["ConductingEquipment", "ACLineSegment", "Switch", "PowerTransformer", "EnergyConsumer", "GeneratingUnit"],
}

# Operator mapping for Cypher (kept for any legacy callers)
CYPHER_OPERATORS: Dict[str, str] = {
    "eq": "=",    "==": "=",
    "neq": "<>",  "!=": "<>",
    "gt": ">",    ">": ">",
    "lt": "<",    "<": "<",
    "gte": ">=",  ">=": ">=",
    "lte": "<=",  "<=": "<=",
    "contains":    "CONTAINS",
    "starts_with": "STARTS WITH",
    "ends_with":   "ENDS WITH",
    "exists":      "IS NOT NULL",
    "not_exists":  "IS NULL",
}


def apply_mappings(obj: Any) -> Dict[str, Any]:
    """
    Calculates virtual/display properties for a CIM object held in memory.
    Supports both native objects (getattr) and dicts.
    """
    results: Dict[str, Any] = {}
    cls_name = ""

    if hasattr(obj, "__class__"):
        cls_name = obj.__class__.__name__
    elif isinstance(obj, dict):
        cls_name = obj.get("cim_class") or obj.get("type") or ""

    if not cls_name or cls_name not in CIM_PROPERTY_MAP:
        return results

    specs = {**DEFAULT_MAPPINGS, **CIM_PROPERTY_MAP.get(cls_name, {})}

    for prop_name, spec in specs.items():
        attr = spec.get("attribute")
        if not attr:
            continue

        val = None
        if isinstance(obj, dict):
            val = obj.get(attr)
            if val is None and "." in attr:
                val = obj.get(attr.split(".")[-1])
        elif not isinstance(obj, dict):
            val = getattr(obj, attr.split(".")[-1], None)

        if val is not None:
            try:
                scale = spec.get("scale", 1.0)
                results[prop_name] = val / scale if isinstance(val, (int, float)) else val
            except Exception:
                results[prop_name] = val

    return results
