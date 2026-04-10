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
        """Build a CN-anchored traversal query from path_steps.

        Conditions are routed to the correct step alias based on the class prefix
        of each condition's path — so a condition on 'PowerElectronicsConnection.ratedS'
        targets the PowerElectronicsConnection alias even when it is an intermediate step.

        Generates e.g.:
          MATCH (cn:ConnectivityNode)-[]-(t:Terminal)-[]-(n:PowerElectronicsConnection)-[]-(n1:BatteryUnit)
          WHERE toFloat(n.`PowerElectronicsConnection.ratedS`) > $p0
          RETURN DISTINCT cn.`IdentifiedObject.mRID` AS mrid
        """
        # Assign aliases: ConnectivityNode → cn, Terminal → t, rest → n, n1, n2…
        aliases: List[str] = []
        class_to_alias: Dict[str, str] = {}
        user_idx = 0
        for step in path_steps:
            cls = step.get("class", "")
            if step.get("fixed"):
                alias = "cn" if cls == "ConnectivityNode" else "t"
            else:
                alias = "n" if user_idx == 0 else f"n{user_idx}"
                user_idx += 1
            aliases.append(alias)
            class_to_alias[cls] = alias

        # Build MATCH pattern
        parts = [f"({aliases[0]}:{path_steps[0]['class']})"]
        for i in range(1, len(path_steps)):
            parts.append(f"-[]-({aliases[i]}:{path_steps[i]['class']})")
        match_str = "MATCH " + "".join(parts)

        # Last non-fixed step is the fallback target for inherited/unknown class prefixes
        last_user_step = next((s for s in reversed(path_steps) if not s.get("fixed")), path_steps[-1])
        main_class = last_user_step["class"]
        main_alias = class_to_alias[main_class]

        # Build WHERE — each condition routes to the matching step alias
        where_parts: List[str] = []
        for cond in rule_config.get("conditions", []):
            if "logical_op" in cond:
                continue  # skip nested groups for now (path rules use flat conditions)
            path = cond.get("path", "")
            dot = path.find(".")
            class_prefix = path[:dot] if dot > -1 else None

            if class_prefix and class_prefix in class_to_alias:
                cond_alias = class_to_alias[class_prefix]
                cond_class = class_prefix
            else:
                cond_alias = main_alias
                cond_class = main_class

            fragment = self._build_leaf({**cond}, cond_class, node_alias=cond_alias)
            if fragment:
                where_parts.append(fragment)

        logical_op = rule_config.get("logical_op", "AND").upper()
        where = f" {logical_op} ".join(where_parts)

        if where:
            query = f"{match_str}\nWHERE {where}\nRETURN DISTINCT cn.`{_MRID_KEY}` AS mrid"
        else:
            query = f"{match_str}\nRETURN DISTINCT cn.`{_MRID_KEY}` AS mrid"

        return query, self.params, self.warnings

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
