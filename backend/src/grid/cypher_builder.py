"""
Generic Cypher query builder for CIM display rules.

Mirrors the logic in frontend/src/features/grid/model/ruleQueryBuilder.ts so that
both the client (test/preview) and server (bulk classify_all) produce equivalent queries.
"""
import logging
import re
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# CIM base/mixin classes whose properties are stored directly on equipment nodes
_INHERITED_CLASSES = frozenset({
    "IdentifiedObject",
    "PowerSystemResource",
    "Equipment",
    "ConductingEquipment",
    "Switch",
    "Conductor",
    "EnergyConnection",
    "ConnectivityNodeContainer",
    "EquipmentContainer",
})

# Operator translation table
_OPS: Dict[str, str] = {
    "eq": "=",  "==": "=",
    "neq": "<>", "!=": "<>",
    "gt": ">",   ">": ">",
    "lt": "<",   "<": "<",
    "gte": ">=", ">=": ">=",
    "lte": "<=", "<=": "<=",
    "contains":    "CONTAINS",
    "starts_with": "STARTS WITH",
    "ends_with":   "ENDS WITH",
    "exists":      "IS NOT NULL",
    "not_exists":  "IS NULL",
}

# Operators that require numeric comparison
_NUMERIC_OPS: frozenset = frozenset({">", "<", ">=", "<="})

# mRID property key used by n10s
_MRID_KEY = "IdentifiedObject.mRID"

# List of common CIM base classes whose prefixes might be used in Neo4j
_CIM_PREFIXES = [
    "Switch", "ConductingEquipment", "Equipment", "PowerSystemResource", 
    "IdentifiedObject", "EnergyConnection", "ConnectivityNodeContainer", 
    "EquipmentContainer", "PowerTransformerEnd", "TransformerEnd"
]


def _is_safe_identifier(val: str) -> bool:
    if not val:
        return True
    return bool(re.match(r"^[a-zA-Z0-9_.]+$", str(val)))

class CypherRuleBuilder:
    """Builds parameterized Cypher MATCH queries from MatchConditions dicts."""

    def __init__(self) -> None:
        self.params: Dict[str, Any] = {}
        self._idx = 0
        self.warnings: List[str] = []

    def build_rule_query(
        self,
        rule_config: Dict[str, Any],
        cim_class: str,
    ) -> Tuple[str, Dict[str, Any], List[str]]:
        self.params = {}
        self._idx = 0
        self.warnings = []

        if not _is_safe_identifier(cim_class):
            raise ValueError(f"Invalid identifier for cim_class: {cim_class}")

        rule_mode = rule_config.get("rule_mode", "guided")

        if rule_mode == "custom_cypher":
            cypher = (rule_config.get("custom_cypher") or "").strip()
            if not cypher:
                self.warnings.append("No custom Cypher provided.")
                return "", self.params, self.warnings
            return cypher, self.params, self.warnings

        path_steps = rule_config.get("path_steps")
        if path_steps and len(path_steps) > 0:
            return self._build_path_query(rule_config, path_steps)

        # Legacy fallback
        where = self._build_group(rule_config, cim_class)
        mrid_expr = f"n.`{_MRID_KEY}`"
        if where:
            query = f"MATCH (n:{cim_class}) WHERE {where} RETURN {mrid_expr} AS mrid"
        else:
            query = f"MATCH (n:{cim_class}) RETURN {mrid_expr} AS mrid"
        return query, self.params, self.warnings

    def _build_path_query(
        self,
        rule_config: Dict[str, Any],
        path_steps: List[Dict[str, Any]],
    ) -> Tuple[str, Dict[str, Any], List[str]]:
        aliases: Dict[str, str] = {}
        class_to_alias: Dict[str, str] = {}
        user_idx = 0
        entity_type = rule_config.get("entity_type", "node")
        
        for i, step in enumerate(path_steps):
            cls = step.get("class", "")
            if not _is_safe_identifier(cls):
                raise ValueError(f"Invalid identifier for class: {cls}")
            if step.get("fixed"):
                alias = "cn" if cls == "ConnectivityNode" else "t"
            elif entity_type == "edge" and i == 0:
                alias = "n"
            else:
                alias = "n" if user_idx == 0 else f"n{user_idx}"
                user_idx += 1
            if "id" in step:
                aliases[step["id"]] = alias
            class_to_alias[cls] = alias

        pattern_parts: List[str] = []
        defined_nodes = set()
        for i, step in enumerate(path_steps):
            alias = aliases.get(step.get("id")) or class_to_alias.get(step.get("class"))
            if not alias: continue
            child_def = alias if alias in defined_nodes else f"{alias}:{step.get('class')}"
            defined_nodes.add(alias)
            
            parent_id = step.get("parent_id")
            parent_alias = None
            if parent_id and parent_id in aliases:
                parent_alias = aliases[parent_id]
                parent_step = next((s for s in path_steps if s.get("id") == parent_id), None)
            elif i > 0:
                prev_step = path_steps[i - 1]
                parent_alias = aliases.get(prev_step.get("id")) or class_to_alias.get(prev_step.get("class"))
                parent_step = prev_step

            if parent_alias and parent_step:
                parent_cls = parent_step.get("class", "")
                parent_def = parent_alias if parent_alias in defined_nodes else f"{parent_alias}:{parent_cls}"
                defined_nodes.add(parent_alias)
                pattern_parts.append(f"({parent_def})-[]-({child_def})")
            else:
                pattern_parts.append(f"({child_def})")
                
        match_str = "MATCH " + ", ".join(pattern_parts) if pattern_parts else ""
        
        # Both nodes and edges anchor on the root equipment (first step) in this architecture
        anchor_alias = aliases.get(path_steps[0].get("id")) or "n"

        last_user_step = next((s for s in reversed(path_steps) if not s.get("fixed")), path_steps[-1])
        main_class = last_user_step.get("class", "")
        main_alias = aliases.get(last_user_step.get("id")) or class_to_alias.get(main_class, "n")

        where_parts: List[str] = []

        # Geometry type filtering.
        # Assume root equipment always has a direct relationship to a Location entity.
        # - node: renders as a point (fewer than 2 distinct position points)
        # - edge: renders as a polyline (2 or more distinct position points)
        geometry_type = rule_config.get("geometry_type")
        if geometry_type == "node":
            where_parts.append(f"COUNT {{ ({anchor_alias})-[:`PowerSystemResource.Location`]->()<-[:`PositionPoint.Location`]-(:PositionPoint) }} < 2")
        elif geometry_type == "edge":
            where_parts.append(f"COUNT {{ ({anchor_alias})-[:`PowerSystemResource.Location`]->()<-[:`PositionPoint.Location`]-(:PositionPoint) }} >= 2")

        for cond in rule_config.get("conditions", []):
            if "logical_op" in cond: continue
            step_id = cond.get("step_id")
            cond_alias = aliases.get(step_id) if step_id else None
            if not cond_alias:
                path = cond.get("path", "")
                dot = path.find(".")
                prefix = path[:dot] if dot > -1 else None
                cond_alias = class_to_alias.get(prefix, main_alias)
            
            fragment = self._build_condition_str(cond, cond_alias, aliases, class_to_alias)
            if fragment: where_parts.append(fragment)

        logical_op = rule_config.get("logical_op", "AND").upper()
        where = f" {logical_op} ".join(where_parts)

        tooltip_projections: List[str] = []
        for step in path_steps:
            attrs = step.get("tooltip_attributes")
            if not attrs: continue
            alias = aliases.get(step.get("id")) or class_to_alias.get(step.get("class"))
            if not alias: continue
            for attr_obj in attrs:
                attr = attr_obj.get("attr")
                col = attr_obj.get("alias")
                if not attr or not col: continue
                if not _is_safe_identifier(attr):
                    raise ValueError(f"Invalid identifier for tooltip attribute: {attr}")
                safe_col = "".join(c if c.isalnum() or c == "_" else "_" for c in col)
                tooltip_projections.append(f"{alias}.`{attr}` AS tp_{safe_col}")

        return_cols = [f"{anchor_alias}.`{_MRID_KEY}` AS mrid"] + tooltip_projections
        return_str = ", ".join(return_cols)

        if where:
            query = f"{match_str}\nWHERE {where}\nRETURN DISTINCT {return_str}"
        else:
            query = f"{match_str}\nRETURN DISTINCT {return_str}"
        return query, self.params, self.warnings

    def _build_condition_str(
        self,
        cond: Dict[str, Any],
        alias: str,
        aliases_map: Dict[str, str],
        class_to_alias: Dict[str, str] = None,
    ) -> str:
        path = cond.get("path", "")
        if not _is_safe_identifier(path):
            raise ValueError(f"Invalid identifier for path: {path}")
        op_str = cond.get("op", "")
        value_type = cond.get("value_type", "literal")
        if not path or not op_str: return ""

        cypher_op = _OPS.get(op_str)
        if not cypher_op: return ""

        dot = path.find(".")
        attr = path[dot+1:] if dot > -1 else path
        
        alternatives = [path]
        if dot > -1:
            alternatives.append(attr)
            for p in _CIM_PREFIXES:
                alt = f"{p}.{attr}"
                if alt not in alternatives: alternatives.append(alt)
        
        prop_exprs = [f"{alias}.`{alt}`" for alt in alternatives]
        
        if cypher_op in ("IS NOT NULL", "IS NULL"):
            return f"({' OR '.join([f'{p} {cypher_op}' for p in prop_exprs])})"

        if value_type == "property":
            compare_step_id = cond.get("compare_step_id")
            compare_path = cond.get("compare_path")
            if not _is_safe_identifier(compare_path):
                raise ValueError(f"Invalid identifier for compare_path: {compare_path}")
            if not compare_path: return ""
            compare_alias = aliases_map.get(compare_step_id)
            if not compare_alias and class_to_alias:
                c_dot = compare_path.find(".")
                c_prefix = compare_path[:c_dot] if c_dot > -1 else None
                compare_alias = class_to_alias.get(c_prefix)
            
            if compare_alias:
                # We don't try alternatives for property-to-property yet to keep it simple
                raw = f"{alias}.`{path}`"
                compare_raw = f"{compare_alias}.`{compare_path}`"
                p_expr = f"toFloat({raw})" if cypher_op in _NUMERIC_OPS else raw
                cp_expr = f"toFloat({compare_raw})" if cypher_op in _NUMERIC_OPS else compare_raw
                return f"{p_expr} {cypher_op} {cp_expr}"
            return ""

        coerced = _coerce(cond.get("value"))
        
        # Boolean handling
        if isinstance(coerced, bool) and cypher_op == "=":
            p_low = self._param(str(coerced).lower())
            p_cap = self._param(str(coerced).capitalize())
            parts = []
            for p in prop_exprs:
                parts.append(f"({p} = {p_low} OR {p} = {p_cap})")
            return f"({' OR '.join(parts)})"

        param_name = self._param(coerced)
        if cypher_op == "=" and isinstance(coerced, (int, float)):
            str_param = self._param(str(int(coerced)) if coerced == int(coerced) else str(coerced))
            return f"({' OR '.join([f'({p} = {param_name} OR {p} = {str_param})' for p in prop_exprs])})"
            
        def wrap(p): return f"toFloat({p})" if cypher_op in _NUMERIC_OPS else p
        return f"({' OR '.join([f'{wrap(p)} {cypher_op} {param_name}' for p in prop_exprs])})"

    def _param(self, value: Any) -> str:
        key = f"p{self._idx}"
        self._idx += 1
        self.params[key] = value
        return f"${key}"

    def _build_group(self, group: Dict[str, Any], cim_class: str, node_alias: str = "n") -> str:
        logical_op = group.get("logical_op", "AND").upper()
        parts: List[str] = []
        for cond in group.get("conditions", []):
            if "logical_op" in cond:
                sub = self._build_group(cond, cim_class, node_alias=node_alias)
                if sub: parts.append(f"({sub})")
            else:
                leaf = self._build_leaf(cond, cim_class, node_alias=node_alias)
                if leaf: parts.append(leaf)
        return f" {logical_op} ".join(parts)

    def _build_leaf(self, cond: Dict[str, Any], cim_class: str, node_alias: str = "n") -> str:
        if cond.get("type") == "field_device_classifier":
            from src.shared.cim.classifiers import CLASSIFIER_BY_NAME
            classifier = CLASSIFIER_BY_NAME.get(cond.get("classifier_name", ""))
            return f"EXISTS {{ {classifier.exists_pattern} }}" if classifier else ""

        path = cond.get("path", "")
        if not _is_safe_identifier(path):
            raise ValueError(f"Invalid identifier for path: {path}")
        op_str = cond.get("op", "")
        if not path or not op_str: return ""
        cypher_op = _OPS.get(op_str)
        if not cypher_op: return ""

        coerced = _coerce(cond.get("value"))
        dot = path.find(".")
        class_prefix = path[:dot] if dot > -1 else None
        
        if not class_prefix or class_prefix == cim_class or class_prefix in _INHERITED_CLASSES:
            raw_prop = f"{node_alias}.`{path}`"
            p_expr = f"toFloat({raw_prop})" if cypher_op in _NUMERIC_OPS else raw_prop
            if cypher_op in ("IS NOT NULL", "IS NULL"): return f"{raw_prop} {cypher_op}"
            return f"{p_expr} {cypher_op} {self._param(coerced)}"

        graph_path = cond.get("graph_path")
        traversal = _build_traversal(cim_class, class_prefix, graph_path)
        raw_e_prop = f"e.`{path}`"
        e_prop = f"toFloat({raw_e_prop})" if cypher_op in _NUMERIC_OPS else raw_e_prop
        if cypher_op in ("IS NOT NULL", "IS NULL"):
            return f"EXISTS {{ ({node_alias}:{cim_class}){traversal} WHERE {raw_e_prop} {cypher_op} }}"
        return f"EXISTS {{ ({node_alias}:{cim_class}){traversal} WHERE {e_prop} {cypher_op} {self._param(coerced)} }}"

def _build_traversal(root_class: str, target_class: Optional[str], graph_path: Optional[list]) -> str:
    if not _is_safe_identifier(root_class) or not _is_safe_identifier(target_class):
        raise ValueError("Invalid class identifier in traversal")
    if graph_path and len(graph_path) > 0:
        parts = []
        for hop in graph_path[:-1]:
            rel = hop.get('rel', '')
            label = hop.get('label', '')
            if not _is_safe_identifier(rel) or not _is_safe_identifier(label):
                raise ValueError("Invalid relationship or label identifier in traversal")
            label_str = f":{label}" if label else ""
            parts.append(f"-[:`{rel}`]-({label_str})")
        last_rel = graph_path[-1].get('rel', '')
        if not _is_safe_identifier(last_rel):
            raise ValueError("Invalid relationship identifier in traversal")
        parts.append(f"-[:`{last_rel}`]-(e:{target_class})")
        return "".join(parts)
    return f"-[*1..3]-(e:{target_class})"

def _coerce(val: Any) -> Any:
    if not isinstance(val, str) or val == "": return val
    low = val.lower().strip()
    if low == "true": return True
    if low == "false": return False
    try:
        if "." in val: return float(val)
        return int(val)
    except: return val
