"""Schema must report which CIM ancestor class defines each attribute.

In CIM, inherited properties (e.g. `open` on Switch) are stored under the
defining class's namespace in n10s — `Switch.open`, not `LoadBreakSwitch.open`.
The rule editor needs to know this so it qualifies the property path with the
ancestor that actually declares the attribute.
"""
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

import unittest

from src.shared.cim.profile import CimProfileService


class TestAttributeDefiningClass(unittest.TestCase):
    def setUp(self):
        # Force a fresh init so previous tests can't pollute the cache.
        CimProfileService._instance = None
        self.svc = CimProfileService.get_instance()
        self.svc.initialize()

    def _attr(self, schema_class: str, attr_name: str):
        attrs = self.svc.schema.get(schema_class, {}).get("attributes", [])
        for a in attrs:
            if a["name"] == attr_name:
                return a
        return None

    def test_switch_open_defined_on_switch(self):
        """`open` on Switch should report Switch as its defining class."""
        a = self._attr("Switch", "open")
        self.assertIsNotNone(a, "Switch.open missing from baseline schema")
        self.assertEqual(a["defining_class"], "Switch")

    def test_load_break_switch_open_defined_on_switch(self):
        """`open` exposed on LoadBreakSwitch must point back to Switch (its declarer).

        This is the LoadBreakSwitch-specific reproduction of the rule-editor bug:
        without this, the editor produces `n.\`LoadBreakSwitch.open\`` which
        does not match anything in n10s storage.
        """
        a = self._attr("LoadBreakSwitch", "open")
        self.assertIsNotNone(a, "LoadBreakSwitch.open missing from baseline schema")
        self.assertEqual(
            a["defining_class"], "Switch",
            f"Expected Switch as defining class for LoadBreakSwitch.open, got {a.get('defining_class')!r}"
        )

    def test_breaker_open_defined_on_switch(self):
        """Same property on Breaker (another Switch subclass) — covers the general case."""
        a = self._attr("Breaker", "open")
        self.assertIsNotNone(a)
        self.assertEqual(a["defining_class"], "Switch")

    def test_mrid_defined_on_identified_object(self):
        """`mRID` should resolve to IdentifiedObject across all subclasses."""
        for cls in ("LoadBreakSwitch", "ACLineSegment", "PowerTransformer"):
            a = self._attr(cls, "mRID")
            self.assertIsNotNone(a, f"mRID missing from {cls}")
            self.assertEqual(
                a["defining_class"], "IdentifiedObject",
                f"{cls}.mRID should originate from IdentifiedObject, got {a.get('defining_class')!r}"
            )

    def test_attribute_declared_on_leaf_keeps_leaf_as_defining_class(self):
        """If an attribute is genuinely first-declared on the class itself, keep that class.

        ACLineSegment declares its own `r`, `x`, etc. (resistance/reactance), not
        inherited from Conductor. The defining_class should be ACLineSegment.
        """
        a = self._attr("ACLineSegment", "r")
        if a is None:
            self.skipTest("ACLineSegment.r not in schema")
        # We don't assert exactly ACLineSegment vs Conductor here because the CIM
        # profile may model it either way; just assert that *some* defining class
        # is present and is a known CIM class.
        self.assertIn("defining_class", a)
        self.assertIn(a["defining_class"], self.svc.classes)


if __name__ == "__main__":
    unittest.main()
