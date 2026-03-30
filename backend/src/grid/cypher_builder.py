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
        """Return (cypher, params, warnings) for the given rule conditions."""
        self.params = {}
        self._idx = 0
        self.warnings = []

        where = self._build_group(rule_config, cim_class)
        mrid_expr = f"n.`{_MRID_KEY}`"

        if where:
            query = f"MATCH (n:{cim_class}) WHERE {where} RETURN {mrid_expr} AS mrid"
        else:
            query = f"MATCH (n:{cim_class}) RETURN {mrid_expr} AS mrid"

        return query, self.params, self.warnings

    # ── Internal helpers ─────────────────────────────────────────────────────

    def _param(self, value: Any) -> str:
        key = f"p{self._idx}"
        self._idx += 1
        self.params[key] = value
        return f"${key}"

    def _build_group(self, group: Dict[str, Any], cim_class: str) -> str:
        logical_op = group.get("logical_op", "AND").upper()
        parts: List[str] = []

        for cond in group.get("conditions", []):
            if "logical_op" in cond:
                sub = self._build_group(cond, cim_class)
                if sub:
                    parts.append(f"({sub})")
            else:
                leaf = self._build_leaf(cond, cim_class)
                if leaf:
                    parts.append(leaf)

        return f" {logical_op} ".join(parts)

    def _build_leaf(self, cond: Dict[str, Any], cim_class: str) -> str:
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
            raw_prop = f"n.`{path}`" if dot > -1 else f"n.{path}"
            # n10s stores all RDF literals as strings; wrap in toFloat() for ordered comparisons
            prop_expr = f"toFloat({raw_prop})" if cypher_op in _NUMERIC_OPS else raw_prop
            return _comparison(prop_expr, cypher_op, self._param(coerced) if cypher_op not in ("IS NOT NULL", "IS NULL") else None)

        # EXISTS traversal — use captured graph path when available
        graph_path = cond.get("graph_path")  # list of {rel, label} from the graph explorer
        traversal = _build_traversal(cim_class, class_prefix, graph_path)
        raw_e_prop = f"e.`{path}`"
        e_prop = f"toFloat({raw_e_prop})" if cypher_op in _NUMERIC_OPS else raw_e_prop

        if cypher_op in ("IS NOT NULL", "IS NULL"):
            return f"EXISTS {{ (n:{cim_class}){traversal} WHERE {raw_e_prop} {cypher_op} }}"

        param_name = self._param(coerced)
        if cypher_op == "=" and isinstance(coerced, (int, float)):
            # eq with numeric value: also try string form since n10s may store as string
            str_param = self._param(str(int(coerced)) if coerced == int(coerced) else str(coerced))
            inner = f"({raw_e_prop} {cypher_op} {param_name} OR {raw_e_prop} {cypher_op} {str_param})"
        else:
            inner = f"{e_prop} {cypher_op} {param_name}"
        return f"EXISTS {{ (n:{cim_class}){traversal} WHERE {inner} }}"


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
