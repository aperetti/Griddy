import logging
from typing import Any, Dict, List, Tuple
from src.shared.cim.mapping import CIM_PROPERTY_MAP, DEFAULT_MAPPINGS, CYPHER_OPERATORS

logger = logging.getLogger(__name__)

class CypherRuleBuilder:
    """
    Translates JSON rules from the Display Rules Engine into Cypher query fragments.
    Ensures safe execution via parameterization.
    """

    def __init__(self):
        self.params: Dict[str, Any] = {}
        self._param_idx = 0
        self.warnings = []

    def _format_property(self, prop: str, alias: str = "n") -> str:
        """Formats a property name for Cypher (adds backticks if namespaced)."""
        if not prop: return ""
        # If the property already includes the alias (e.g. 'e.ratedS'), return as is
        if '.' in prop and prop.split('.')[0] in ['n', 'e', 'edge', 'r']:
            # But we still need to backtick the attribute part if it has multiple dots
            parts = prop.split('.')
            base = parts[0]
            attr = ".".join(parts[1:])
            if '.' in attr:
                return f"{base}.`{attr}`"
            return prop
            
        if '.' in prop:
            return f"{alias}.`{prop}`"
        return f"{alias}.{prop}"

    def _get_param_name(self, value: Any) -> str:
        """Register a parameter and return its $name."""
        key = f"p{self._param_idx}"
        self._param_idx += 1
        self.params[key] = value
        return f"${key}"

    def build_rule_query(self, rule_config: Dict[str, Any], cim_class: str) -> Tuple[str, Dict[str, Any], List[str]]:
        """
        Builds a complete Cypher query to find mRIDs matching a rule.
        
        Args:
            rule_config: The rule configuration (matching logic).
            cim_class: The base CIM class to search (e.g. PowerTransformer).
            
        Returns:
            Tuple of (query_string, parameters_dict, warnings_list).
        """
        self.params = {}
        self._param_idx = 0
        self.warnings = []
        
        # Base class filter
        from src.shared.cim.mapping import CIM_BASE_CLASSES
        
        # Determine target classes (original + optional subclasses)
        target_classes = [cim_class]
        if cim_class in CIM_BASE_CLASSES:
            target_classes = list(set(target_classes + CIM_BASE_CLASSES[cim_class]))
            
        where_clause = self._build_where_clause(rule_config, cim_class)
        
        # Get the mRID property name from mapping
        mrid_prop = DEFAULT_MAPPINGS.get("mrid", {}).get("attribute", "mRID")
        mrid_expr = self._format_property(mrid_prop, "n")

        # Build the MATCH part with label expansion if needed
        if len(target_classes) > 1:
            class_param = self._get_param_name(target_classes)
            match_clause = f"MATCH (n) WHERE any(lbl IN labels(n) WHERE lbl IN {class_param})"
            if where_clause:
                query = f"{match_clause} AND {where_clause} RETURN {mrid_expr} as mrid"
            else:
                query = f"{match_clause} RETURN {mrid_expr} as mrid"
        else:
            if where_clause:
                query = f"MATCH (n:{cim_class}) WHERE {where_clause} RETURN {mrid_expr} as mrid"
            else:
                query = f"MATCH (n:{cim_class}) RETURN {mrid_expr} as mrid"
            
        return query, self.params, self.warnings

    def _build_where_clause(self, conditions: Dict[str, Any], cim_class: str) -> str:
        """Recursively builds the WHERE clause from JSON conditions."""
        if not conditions:
            return ""

        logical_op = conditions.get("logical_op", "AND").upper()
        cond_list = conditions.get("conditions", [])
        
        if not cond_list:
            return ""

        fragments = []
        for cond in cond_list:
            if "logical_op" in cond:
                # Nested condition
                sub_clause = self._build_where_clause(cond, cim_class)
                if sub_clause:
                    fragments.append(f"({sub_clause})")
            else:
                # Leaf condition
                fragment = self._build_leaf_condition(cond, cim_class)
                if fragment:
                    fragments.append(fragment)

        if not fragments:
            return ""
            
        return f" {logical_op} ".join(fragments)

    def _build_leaf_condition(self, cond: Dict[str, Any], cim_class: str) -> str:
        """Translates a single property condition into a Cypher EXISTS block or direct attribute check."""
        prop = cond.get("path")
        op_str = cond.get("op")
        val = cond.get("value")
        
        if not prop:
            self.warnings.append("Missing 'path' in condition.")
            return ""
            
        # 1. Map operator
        cypher_op = CYPHER_OPERATORS.get(op_str)
        if not cypher_op:
            msg = f"Unrecognized operator: {op_str}"
            logger.warning(msg)
            self.warnings.append(msg)
            return ""

        # 2. Get property mapping (check class-specific, then defaults)
        class_map = CIM_PROPERTY_MAP.get(cim_class, {})
        mapping = class_map.get(prop) or DEFAULT_MAPPINGS.get(prop)

        # 3. Build fragment
        if not mapping:
            # Fallback for direct attributes if not in map
            if isinstance(prop, str) and prop.isidentifier():
                param_name = self._get_param_name(val)
                return f"n.{prop} {cypher_op} {param_name}"
            else:
                msg = f"Property '{prop}' for class '{cim_class}' is not mapped and is not a valid identifier."
                logger.warning(msg)
                self.warnings.append(msg)
                return ""

        # Handle mapped properties
        rel_path = mapping.get("rel_path")
        attr = mapping.get("attribute")
        scale = mapping.get("scale", 1.0)
        
        if isinstance(val, (int, float)) and scale != 1.0:
            try:
                val = float(val) * scale
            except (ValueError, TypeError):
                pass

        param_name = self._get_param_name(val)
        
        # Format the attribute for Cypher (handle namespacing)
        # Note: if it has a rel_path, the attribute might start with 'e.' (handled in _format_property)
        formatted_attr = self._format_property(attr, "n")

        if rel_path:
            return f"EXISTS {{ (n){rel_path} WHERE {formatted_attr} {cypher_op} {param_name} }}"
        else:
            return f"{formatted_attr} {cypher_op} {param_name}"
