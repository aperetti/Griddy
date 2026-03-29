"""
CIM Property Mapping for Cypher Query Generation.

Maps human-friendly property names (used in display rules) to 
CIM attributes and relationship paths in the Neo4j database.
"""
from typing import Any, Dict, Optional

# Default mappings shared across multiple CIM classes
DEFAULT_MAPPINGS = {
    "name": {"attribute": "n.name", "label": "Name"},
    "mrid": {"attribute": "n.mRID", "label": "mRID"},
    "description": {"attribute": "n.description", "label": "Description"},
}

# Map of Display Property -> Cypher fragment/mapping
# Structure: { CIM_CLASS: { DISPLAY_PROPERTY: MAPPING_SPEC } }
CIM_PROPERTY_MAP = {
    "PowerTransformer": {
        "ratedS": {
            "rel_path": "-[:PowerTransformerEnd]->(e:PowerTransformerEnd)",
            "attribute": "e.ratedS",
            "scale": 1e6,  # VA to MVA
            "label": "Rated Power (MVA)",
        },
        "rating": { # Alias for ratedS
            "rel_path": "-[:PowerTransformerEnd]->(e:PowerTransformerEnd)",
            "attribute": "e.ratedS",
            "scale": 1e6, 
            "label": "Rating (MVA)",
        },
        "voltage_kv": {
            "rel_path": "-[:PowerTransformerEnd]->(e:PowerTransformerEnd)",
            "attribute": "e.ratedU",
            "scale": 1000.0, # V to kV
            "label": "Rated Voltage (kV)",
        }
    },
    "EnergyConsumer": {
        "p_mw": {
            "attribute": "n.p",
            "scale": 1e6,
            "label": "Active Power (MW)",
        },
        "q_mvar": {
            "attribute": "n.q",
            "scale": 1e6,
            "label": "Reactive Power (MVAr)",
        },
        "rating": {
            "attribute": "n.p",
            "scale": 1000.0, # W to kVA (assuming pf=1 for display)
            "label": "Rating (kVA)",
        },
        "ratedS": { # Alias
            "attribute": "n.p",
            "scale": 1000.0,
            "label": "Rated Power (kVA)",
        }
    },
    "ACLineSegment": {
        "length_m": {"attribute": "n.length", "label": "Length (m)"},
        "r": {"attribute": "n.r", "label": "Resistance (Ohm)"},
        "x": {"attribute": "n.x", "label": "Reactance (Ohm)"},
    },
    "Switch": {
        "is_open": {
            "attribute": "n.normalOpen",
            "type": "boolean",
            "label": "Normally Open",
        }
    }
}

# List of base classes and their common subclasses to include in rule matching
CIM_BASE_CLASSES = {
    "Switch": ["Switch", "LoadBreakSwitch", "Fuse", "Breaker", "Disconnector", "Sectionaliser", "Recloser"],
    "PowerTransformer": ["PowerTransformer", "Transformer"],
    "ConductingEquipment": ["ConductingEquipment", "ACLineSegment", "Switch", "PowerTransformer", "EnergyConsumer", "GeneratingUnit"],
}

# Operator mapping for Cypher
CYPHER_OPERATORS = {
    "eq": "=",
    "==": "=",
    "neq": "<>",
    "!=": "<>",
    "gt": ">",
    ">": ">",
    "lt": "<",
    "<": "<",
    "gte": ">=",
    ">=": ">=",
    "lte": "<=",
    "<=": "<=",
    "contains": "CONTAINS",
    "starts_with": "STARTS WITH",
    "ends_with": "ENDS WITH",
    "exists": "IS NOT NULL",
    "not_exists": "IS NULL",
}

def apply_mappings(obj: Any) -> Dict[str, Any]:
    """
    Calculates virtual properties for a CIM object.
    Supports both native objects (with getattr) and dictionaries.
    """
    results = {}
    cls_name = ""
    
    if hasattr(obj, "__class__"):
        cls_name = obj.__class__.__name__
    elif isinstance(obj, dict):
        cls_name = obj.get("cim_class") or obj.get("type")
        
    if not cls_name or cls_name not in CIM_PROPERTY_MAP:
        return results
        
    specs = CIM_PROPERTY_MAP.get(cls_name, {})
    # Merge with default mappings
    all_specs = {**DEFAULT_MAPPINGS, **specs}
    
    for prop_name, spec in all_specs.items():
        # We only support direct attributes in this local mapping 
        # (rel_path requires graph traversal, handled in Cypher/Manager)
        if spec.get("rel_path"):
            continue
            
        attr = spec.get("attribute")
        if not attr: continue
        
        # Clean attribute path (e.g., 'n.p' -> 'p')
        raw_attr = attr.split('.')[-1]
        
        val = None
        if hasattr(obj, raw_attr):
            val = getattr(obj, raw_attr, None)
        elif isinstance(obj, dict):
            val = obj.get(raw_attr)
            
        if val is not None:
            try:
                scale = spec.get("scale", 1.0)
                if isinstance(val, (int, float)):
                    results[prop_name] = val / scale
                else:
                    results[prop_name] = val
            except:
                results[prop_name] = val
                
    return results
