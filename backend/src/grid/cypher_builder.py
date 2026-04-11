"""
Generic Cypher query builder for CIM display rules.

Mirrors the logic in frontend/src/features/grid/model/ruleQueryBuilder.ts so that
both the client (test/preview) and server (bulk classify_all) produce equivalent queries.

Design
------
Condition ``path`` stores the full Neo4j property key as stored by n10s/cimgraph, e.g.:
  - "IdentifiedObject.name"         (base class property — on every node)
  - "EnergyConsumer.p"              (class property — direct match on target node)
  - "TransformerEndInfo.ratedS"     (related-object property — EXISTS traversal)

If the class prefix of ``path`` is the target class itself, or is a known CIM base/mixin
class whose attributes n10s flattens onto equipment nodes, we match directly on ``n``.

Otherwise we generate a variable-length EXISTS subquery:
  EXISTS { (n)-[*1..5]-(e:CimClass) WHERE e.`path` = $p0 }

This requires no knowledge of specific relationship names and works for any CIM topology.
"""
import logging
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# CIM base/mixin classes whose properties are stored directly on equipment nodes
# (i.e. n10s/cimgraph flatten inherited attributes onto the node itself)
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

# Operators that require numeric comparison — n10s stores all RDF literals as
# strings, so we wrap the property in toFloat() for these ops so that
# toFloat("1500000") < 1500000 evaluates correctly.
_NUMERIC_OPS: frozenset = frozenset({">", "<", ">=", "<="})

# mRID property key used by n10s
_MRID_KEY = "IdentifiedObject.mRID"


class CypherRuleBuilder:
    """Builds parameterized Cypher MATCH queries from MatchConditions dicts."""

    def __init__(self) -> None:
        self.params: Dict[str, Any] = {}
        self._idx = 0
        self.warnings: List[str] = []

    # ── Public API ────────────────────────────────────────────────────────────

    def build_rule_query(
        self,
        rule_config: Dict[str, Any],
        cim_class: str,
    ) -> Tuple[str, Dict[str, Any], List[str]]:
        """Return (cypher, params, warnings) for the given rule conditions.

        Dispatches to path-based or legacy generation based on rule_mode / path_steps.
        """
        self.params = {}
        self._idx = 0
        self.warnings = []

        rule_mode = rule_config.get("rule_mode", "guided")

        # ── Custom Cypher pass-through ────────────────────────────────────────
        if rule_mode == "custom_cypher":
            cypher = (rule_config.get("custom_cypher") or "").strip()
            if not cypher:
                self.warnings.append("No custom Cypher provided.")
                return "", self.params, self.warnings
            if "RETURN" not in cypher.upper():
                self.warnings.append("Query must include a RETURN clause.")
            if "as mrid" not in cypher.lower():
                self.warnings.append("Query should RETURN ... AS mrid for the rule engine to use results.")
            if rule_config.get("entity_type") == "node" and "ConnectivityNode" not in cypher:
                self.warnings.append("Node rules should reference ConnectivityNode in the query.")
            return cypher, self.params, self.warnings

        # ── Path-based (guided node rule with path_steps) ─────────────────────
        path_steps = rule_config.get("path_steps")
        if path_steps and len(path_steps) > 0:
            return self._build_path_query(rule_config, path_steps)

        # ── Legacy fallback (target_class + optional resolve_via_connectivity_node) ──
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
        
        for step in path_steps:
            cls = step.get("class", "")
            if step.get("fixed"):
                alias = "cn" if cls == "ConnectivityNode" else "t"
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
            if not alias:
                continue
                
            child_def = alias if alias in defined_nodes else f"{alias}:{step.get('class')}"
            defined_nodes.add(alias)
            
            parent_id = step.get("parent_id")
            parent_alias = None
            parent_step = None
            
            if parent_id and parent_id in aliases:
                parent_alias = aliases[parent_id]
                parent_step = next((s for s in path_steps if s.get("id") == parent_id), None)
            elif i > 0:
                # Legacy support: if no parent_id, chain from the previous step
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
                
        match_str = ""
        if pattern_parts:
            match_str = "MATCH " + ", ".join(pattern_parts)

        last_user_step = next((s for s in reversed(path_steps) if not s.get("fixed")), path_steps[-1])
        main_class = last_user_step.get("class", "")
        if last_user_step.get("id") and last_user_step["id"] in aliases:
            main_alias = aliases[last_user_step["id"]]
        else:
            main_alias = class_to_alias.get(main_class, list(aliases.values())[-1] if aliases else "n")

        where_parts: List[str] = []
        for cond in rule_config.get("conditions", []):
            if "logical_op" in cond:
                continue
            
            step_id = cond.get("step_id")
            if step_id and step_id in aliases:
                cond_alias = aliases[step_id]
            else:
                path = cond.get("path", "")
                dot = path.find(".")
                class_prefix = path[:dot] if dot > -1 else None
                if class_prefix and class_prefix in class_to_alias:
                    cond_alias = class_to_alias[class_prefix]
                else:
                    cond_alias = main_alias
            
            fragment = self._build_condition_str(cond, cond_alias, aliases, class_to_alias)
            if fragment:
                where_parts.append(fragment)

        logical_op = rule_config.get("logical_op", "AND").upper()
        where = f" {logical_op} ".join(where_parts)

        # Project tooltips from each step as tp_{alias} return columns
        tooltip_projections: List[str] = []
        for step in path_steps:
            attrs = step.get("tooltip_attributes")
            if not attrs:
                continue
            
            # Robust alias lookup: try step_id then class name
            step_id = step.get("id")
            alias = aliases.get(step_id) if step_id else None
            if not alias:
                alias = class_to_alias.get(step.get("class"))
            
            if not alias:
                continue

            for attr_obj in attrs:
                attr = attr_obj.get("attr")
                col = attr_obj.get("alias")
                if not attr or not col:
                    continue
                # Sanitize alias: alphanumeric + underscore only
                safe_col = "".join(c if c.isalnum() or c == "_" else "_" for c in col)
                tooltip_projections.append(f"{alias}.`{attr}` AS tp_{safe_col}")

        return_cols = [f"cn.`{_MRID_KEY}` AS mrid"] + tooltip_projections
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
        """Equivalent to _buildConditionStr in TS for path queries."""
        path = cond.get("path", "")
        op_str = cond.get("op", "")
        value_type = cond.get("value_type", "literal")
        
        if not path or not op_str:
            return ""

        cypher_op = _OPS.get(op_str)
        if not cypher_op:
            return ""

        raw_prop = f"{alias}.`{path}`"
        prop_expr = f"toFloat({raw_prop})" if cypher_op in _NUMERIC_OPS else raw_prop

        if cypher_op in ("IS NOT NULL", "IS NULL"):
            return f"{raw_prop} {cypher_op}"

        if value_type == "property":
            compare_step_id = cond.get("compare_step_id")
            compare_path = cond.get("compare_path")
            if not compare_path:
                return ""
                
            compare_alias = None
            if compare_step_id and compare_step_id in aliases_map:
                compare_alias = aliases_map[compare_step_id]
            elif class_to_alias:
                # Fallback to class-based routing if step_id is missing or unknown
                dot = compare_path.find(".")
                prefix = compare_path[:dot] if dot > -1 else None
                if prefix and prefix in class_to_alias:
                    compare_alias = class_to_alias[prefix]
            
            if compare_alias:
                compare_raw = f"{compare_alias}.`{compare_path}`"
                compare_prop_expr = f"toFloat({compare_raw})" if cypher_op in _NUMERIC_OPS else compare_raw
                return f"{prop_expr} {cypher_op} {compare_prop_expr}"
            return ""

        coerced = _coerce(cond.get("value"))
        param_name = self._param(coerced)
        
        if cypher_op == "=" and isinstance(coerced, (int, float)):
            str_param = self._param(str(int(coerced)) if coerced == int(coerced) else str(coerced))
            return f"({raw_prop} = {param_name} OR {raw_prop} = {str_param})"
            
        return f"{prop_expr} {cypher_op} {param_name}"

    # ── Internal helpers ─────────────────────────────────────────────────────

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
                if sub:
                    parts.append(f"({sub})")
            else:
                leaf = self._build_leaf(cond, cim_class, node_alias=node_alias)
                if leaf:
                    parts.append(leaf)

        return f" {logical_op} ".join(parts)

    def _build_leaf(self, cond: Dict[str, Any], cim_class: str, node_alias: str = "n") -> str:
        # ── Field Device Classifier shorthand ─────────────────────────────────
        # Condition shape: {"type": "field_device_classifier", "classifier_name": "Recloser"}
        # Emits a verbatim EXISTS { <exists_pattern> } fragment from the registry.
        if cond.get("type") == "field_device_classifier":
            return self._build_classifier_exists(cond, cim_class)

        path = cond.get("path", "")
        op_str = cond.get("op", "")
        val = cond.get("value")

        if not path or not op_str:
            return ""

        cypher_op = _OPS.get(op_str)
        if not cypher_op:
            self.warnings.append(f"Unknown operator: {op_str!r}")
            return ""

        coerced = _coerce(val)

        dot = path.find(".")
        class_prefix = path[:dot] if dot > -1 else None
        is_direct = (
            not class_prefix
            or class_prefix == cim_class
            or class_prefix in _INHERITED_CLASSES
        )

        if is_direct:
            raw_prop = f"{node_alias}.`{path}`" if dot > -1 else f"{node_alias}.{path}"
            # n10s stores all RDF literals as strings; wrap in toFloat() for ordered comparisons
            prop_expr = f"toFloat({raw_prop})" if cypher_op in _NUMERIC_OPS else raw_prop
            return _comparison(prop_expr, cypher_op, self._param(coerced) if cypher_op not in ("IS NOT NULL", "IS NULL") else None)

        # EXISTS traversal — use captured graph path when available
        graph_path = cond.get("graph_path")  # list of {rel, label} from the graph explorer
        traversal = _build_traversal(cim_class, class_prefix, graph_path)
        raw_e_prop = f"e.`{path}`"
        e_prop = f"toFloat({raw_e_prop})" if cypher_op in _NUMERIC_OPS else raw_e_prop

        if cypher_op in ("IS NOT NULL", "IS NULL"):
            return f"EXISTS {{ ({node_alias}:{cim_class}){traversal} WHERE {raw_e_prop} {cypher_op} }}"

        param_name = self._param(coerced)
        if cypher_op == "=" and isinstance(coerced, (int, float)):
            # eq with numeric value: also try string form since n10s may store as string
            str_param = self._param(str(int(coerced)) if coerced == int(coerced) else str(coerced))
            inner = f"({raw_e_prop} {cypher_op} {param_name} OR {raw_e_prop} {cypher_op} {str_param})"
        else:
            inner = f"{e_prop} {cypher_op} {param_name}"
        return f"EXISTS {{ ({node_alias}:{cim_class}){traversal} WHERE {inner} }}"

    def _build_classifier_exists(self, cond: Dict[str, Any], cim_class: str) -> str:
        """Build an EXISTS fragment from a named FieldDeviceClassifier.

        Looks up ``classifier_name`` in the registry and emits:
            EXISTS { <classifier.exists_pattern> }

        The ``cim_class`` supplied by the rule is used as a sanity label. If the
        classifier's ``target_cim_class`` differs we emit a warning but still
        generate the clause using the classifier's own pattern (which already
        references the correct label internally).
        """
        from src.shared.cim.classifiers import CLASSIFIER_BY_NAME

        classifier_name = cond.get("classifier_name", "")
        classifier = CLASSIFIER_BY_NAME.get(classifier_name)

        if not classifier:
            known = list(CLASSIFIER_BY_NAME.keys())
            self.warnings.append(
                f"Unknown field_device_classifier '{classifier_name}'. "
                f"Known classifiers: {known}"
            )
            return ""

        if cim_class != classifier.target_cim_class:
            self.warnings.append(
                f"Classifier '{classifier_name}' targets '{classifier.target_cim_class}' "
                f"but rule target_class is '{cim_class}'. "
                f"Using classifier's exists_pattern — ensure target_class matches."
            )

        return f"EXISTS {{ {classifier.exists_pattern} }}"


# ── Module-level helpers ──────────────────────────────────────────────────────

def _build_traversal(root_class: str, target_class: Optional[str], graph_path: Optional[list]) -> str:
    """Build the relationship traversal fragment for an EXISTS subquery.

    If ``graph_path`` is provided (list of {rel, label} dicts captured from the
    graph explorer), generates a specific hop-by-hop pattern:
        -[:`rel1`]-(:Node1)-[:`rel2`]-(e:TargetClass)

    Otherwise falls back to a variable-length undirected path:
        -[*1..3]-(e:TargetClass)
    """
    if graph_path and len(graph_path) > 0:
        parts = []
        for hop in graph_path[:-1]:
            rel = hop.get("rel", "")
            label = hop.get("label", "")
            parts.append(f"-[:`{rel}`]-({f':{label}' if label else ''})")
        last = graph_path[-1]
        parts.append(f"-[:`{last.get('rel', '')}`]-(e:{target_class})")
        return "".join(parts)
    return f"-[*1..3]-(e:{target_class})"


def _comparison(prop: str, op: str, param: Optional[str]) -> str:
    if param is None:
        return f"{prop} {op}"
    return f"{prop} {op} {param}"


def _coerce(val: Any) -> Any:
    """Coerce string-encoded numbers to their numeric type."""
    if not isinstance(val, str) or val == "":
        return val
    try:
        if "." in val:
            return float(val)
        return int(val)
    except (ValueError, TypeError):
        return val
