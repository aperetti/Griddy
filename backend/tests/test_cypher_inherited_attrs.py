"""Backend CypherRuleBuilder must fuzz leaf-class attribute prefixes
to their CIM ancestor namespaces.

In n10s, an inherited attribute (e.g. `open` declared on Switch) is stored
under `Switch.open`, never `LoadBreakSwitch.open`. The rule editor's "Test
Rule Match" preview calls /api/display-rules/test, which delegates to
CypherRuleBuilder. A legacy or hand-typed rule whose path qualifies the
attribute with a leaf class (LoadBreakSwitch.open, Breaker.open, ...) must
still produce a query that reaches the canonical key.
"""
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

import unittest

from src.grid.cypher_builder import CypherRuleBuilder


class TestCypherInheritedAttrs(unittest.TestCase):
    def setUp(self):
        self.builder = CypherRuleBuilder()

    def test_legacy_leaf_class_path_in_path_steps_fuzzes_to_switch(self):
        """A path-step rule with `LoadBreakSwitch.open` must reference Switch.open."""
        conditions = {
            "rule_mode": "guided",
            "entity_type": "node",
            "geometry_type": "edge",
            "path_steps": [
                {"id": "step_lbs", "class": "LoadBreakSwitch"},
            ],
            "logical_op": "AND",
            "conditions": [
                {
                    "id": "c1",
                    "step_id": "step_lbs",
                    "path": "LoadBreakSwitch.open",
                    "op": "==",
                    "value": "true",
                }
            ],
        }
        query, _params, _warnings = self.builder.build_rule_query(conditions, "LoadBreakSwitch")
        # The canonical key (backtick-bounded so we don't substring-match LoadBreakSwitch.open)
        self.assertIn("`Switch.open`", query, f"Expected `Switch.open` in query:\n{query}")

    def test_legacy_leaf_class_path_in_legacy_builder_fuzzes_to_switch(self):
        """The non-path-step (legacy) code path must apply the same fuzzing."""
        conditions = {
            "rule_mode": "guided",
            "target_class": "LoadBreakSwitch",
            "logical_op": "AND",
            "conditions": [
                {"id": "c1", "path": "LoadBreakSwitch.open", "op": "==", "value": "true"}
            ],
        }
        query, _params, _warnings = self.builder.build_rule_query(conditions, "LoadBreakSwitch")
        self.assertIn("`Switch.open`", query, f"Expected `Switch.open` in query:\n{query}")

    def test_canonical_switch_open_path_unchanged(self):
        """Already-canonical Switch.open path stays as-is."""
        conditions = {
            "rule_mode": "guided",
            "entity_type": "node",
            "path_steps": [{"id": "step_lbs", "class": "LoadBreakSwitch"}],
            "logical_op": "AND",
            "conditions": [
                {"id": "c1", "step_id": "step_lbs", "path": "Switch.open", "op": "==", "value": "true"}
            ],
        }
        query, _params, _warnings = self.builder.build_rule_query(conditions, "LoadBreakSwitch")
        self.assertIn("`Switch.open`", query)

    def test_strong_specific_prefix_is_not_fuzzed(self):
        """BaseVoltage.nominalVoltage refers to a separate node — must not get
        rewritten to Switch.nominalVoltage etc."""
        conditions = {
            "rule_mode": "guided",
            "target_class": "ACLineSegment",
            "logical_op": "AND",
            "conditions": [
                {"id": "c1", "path": "BaseVoltage.nominalVoltage", "op": ">", "value": 10000}
            ],
        }
        query, _params, _warnings = self.builder.build_rule_query(conditions, "ACLineSegment")
        # The traversal hop preserves the BaseVoltage.nominalVoltage key.
        self.assertIn("BaseVoltage.nominalVoltage", query)
        self.assertNotIn("Switch.nominalVoltage", query)


if __name__ == "__main__":
    unittest.main()
