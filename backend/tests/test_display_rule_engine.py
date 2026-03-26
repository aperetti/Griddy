import unittest
import sqlite3
import json
import os
import tempfile
from src.grid.display_rule_engine import DisplayRuleEngine

class TestDisplayRuleEngine(unittest.TestCase):
    def setUp(self):
        # Create a temp admin database
        self.db_fd, self.db_path = tempfile.mkstemp()
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Setup schema
        cursor.execute("CREATE TABLE display_configs (id INTEGER PRIMARY KEY, name TEXT, is_default INTEGER)")
        cursor.execute("""
            CREATE TABLE display_config_rules (
                id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                config_id           INTEGER NOT NULL,
                name                TEXT NOT NULL,
                priority            INTEGER DEFAULT 0,
                match_conditions    TEXT,
                config              TEXT,
                enabled             INTEGER DEFAULT 1,
                match_equipment     TEXT,
                match_edge_types    TEXT,
                created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Add default config
        cursor.execute("INSERT INTO display_configs (name, is_default) VALUES ('Default', 1)")
        self.config_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        self.engine = DisplayRuleEngine(self.db_path)

    def tearDown(self):
        try:
            os.close(self.db_fd)
            if os.path.exists(self.db_path):
                os.unlink(self.db_path)
        except:
            pass

    def add_rule(self, name, priority, conditions, visual_type, match_equipment=None, match_edge_types=None, size=1.0, label="", enabled=1):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Pack visual properties into the consolidated 'config' JSON
        config_data = {
            "visual_type": visual_type,
            "size": size,
            "label": label,
            "color_hex": None,  # Default or add as parameter if needed
            "css_overrides": []
        }
        
        cursor.execute("""
            INSERT INTO display_config_rules 
            (config_id, name, priority, match_conditions, config, enabled, match_equipment, match_edge_types)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            self.config_id, name, priority, 
            json.dumps(conditions) if isinstance(conditions, dict) else conditions,
            json.dumps(config_data), 
            enabled,
            json.dumps(match_equipment) if match_equipment else None,
            json.dumps(match_edge_types) if match_edge_types else None
        ))
        conn.commit()
        conn.close()
        self.engine.load_rules()

    def test_node_nested_matching(self):
        # Rule: Any PowerTransformer with ratedS > 500
        self.add_rule("Big Transformer", 10, {
            "target_class": "PowerTransformer",
            "conditions": [
                {"path": "attributes.ratedS", "op": ">", "value": 500}
            ]
        }, "HugeTransformer")

        # Test node with small transformer
        node_small = {
            "attached_equipment": [
                {"type": "PowerTransformer", "attributes": {"ratedS": 100}}
            ]
        }
        self.assertIsNone(self.engine.classify_node(node_small))

        # Test node with big transformer
        node_big = {
            "attached_equipment": [
                {"type": "PowerTransformer", "attributes": {"ratedS": 750}}
            ]
        }
        res = self.engine.classify_node(node_big)
        self.assertEqual(res["visual_type"], "HugeTransformer")

        # Test node with multiple items, one matches
        node_mixed = {
            "attached_equipment": [
                {"type": "PowerTransformer", "attributes": {"ratedS": 100}},
                {"type": "PowerTransformer", "attributes": {"ratedS": 1000}}
            ]
        }
        res = self.engine.classify_node(node_mixed)
        self.assertEqual(res["visual_type"], "HugeTransformer")

    def test_edge_matching(self):
        # Rule: ACLineSegment with length > 1000
        self.add_rule("Long Line", 10, {
            "conditions": [
                {"path": "length_m", "op": ">", "value": 1000}
            ]
        }, "TransmissionLine", match_edge_types=["ACLineSegment"])

        # Small line
        edge_short = {"edge_type": "ACLineSegment", "length_m": 500}
        self.assertIsNone(self.engine.classify_edge(edge_short))

        # Long line
        edge_long = {"edge_type": "ACLineSegment", "length_m": 2500}
        res = self.engine.classify_edge(edge_long)
        self.assertEqual(res["visual_type"], "TransmissionLine")

        # Long line but wrong type
        edge_transformer = {"edge_type": "PowerTransformer", "length_m": 2500}
        self.assertIsNone(self.engine.classify_edge(edge_transformer))

    def test_deep_nested_matching(self):
        # Rule: Transformer with hierarchy.0.asset_id == "TX_789"
        self.add_rule("Specific ID", 10, {
            "target_class": "PowerTransformer",
            "conditions": [
                {"path": "hierarchy.0.asset_id", "op": "==", "value": "TX_789"}
            ]
        }, "SpecialXFR")

        node_match = {
            "attached_equipment": [
                {
                    "type": "PowerTransformer",
                    "hierarchy": [
                        {"asset_id": "TX_789"}
                    ]
                }
            ]
        }
        res = self.engine.classify_node(node_match)
        self.assertEqual(res["visual_type"], "SpecialXFR")
        
    def test_existence_matching(self):
        # Rule: Any equipment with 'sc_current' attribute (exists)
        self.add_rule("Has SC Current", 10, {
            "conditions": [
                {"path": "attributes.sc_current", "op": "exists"}
            ]
        }, "HasSC", size=5.5, label="High SC")

        # Test node with attribute
        node_with = {
            "attached_equipment": [
                {"type": "Breaker", "attributes": {"sc_current": 1000}}
            ]
        }
        res = self.engine.classify_node(node_with)
        self.assertEqual(res["visual_type"], "HasSC")
        self.assertEqual(res["size"], 5.5)
        self.assertEqual(res["label"], "High SC")

        # Test node without attribute
        node_without = {
            "attached_equipment": [
                {"type": "Breaker", "attributes": {"other": 123}}
            ]
        }
        self.assertIsNone(self.engine.classify_node(node_without))

        # Rule: Any equipment without 'name' attribute (not_exists)
        self.add_rule("No Name", 20, {
            "conditions": [
                {"path": "name", "op": "not_exists"}
            ]
        }, "Anonymous")

        node_no_name = {"attached_equipment": [{"type": "Node"}]}
        res = self.engine.classify_node(node_no_name)
        self.assertEqual(res["visual_type"], "Anonymous")

        node_with_name = {"name": "Test Node", "attached_equipment": []}
        self.assertIsNone(self.engine.classify_node(node_with_name))

    def test_logical_operators(self):
        # 1. OR logic: (A OR B)
        self.add_rule("A or B", 10, {
            "logical_op": "OR",
            "conditions": [
                {"path": "name", "op": "==", "value": "Alpha"},
                {"path": "name", "op": "==", "value": "Beta"}
            ]
        }, "MatchAB")
        
        self.assertEqual(self.engine.classify_node({"name": "Alpha", "attached_equipment": []})["visual_type"], "MatchAB")
        self.assertEqual(self.engine.classify_node({"name": "Beta", "attached_equipment": []})["visual_type"], "MatchAB")
        self.assertIsNone(self.engine.classify_node({"name": "Gamma", "attached_equipment": []}))
        
        # 2. Nested logic: A AND (B OR C)
        self.add_rule("A and (B or C)", 20, {
            "logical_op": "AND",
            "conditions": [
                {"path": "class", "op": "==", "value": "VoltageLevel"},
                {
                    "logical_op": "OR",
                    "conditions": [
                        {"path": "voltage", "op": ">", "value": 100},
                        {"path": "name", "op": "contains", "value": "High"}
                    ]
                }
            ]
        }, "MatchComplex")
        
        # Match class + voltage
        res = self.engine.classify_node({"class": "VoltageLevel", "voltage": 115, "attached_equipment": []})
        self.assertIsNotNone(res)
        self.assertEqual(res["visual_type"], "MatchComplex")
        
        # Match class + name
        res = self.engine.classify_node({"class": "VoltageLevel", "voltage": 50, "name": "High Volt", "attached_equipment": []})
        self.assertIsNotNone(res)
        self.assertEqual(res["visual_type"], "MatchComplex")
        
        # Fail class
        self.assertIsNone(self.engine.classify_node({"class": "Substation", "voltage": 115, "attached_equipment": []}))
        
        # Fail both OR conditions
        self.assertIsNone(self.engine.classify_node({"class": "VoltageLevel", "voltage": 50, "name": "Low", "attached_equipment": []}))

    def test_numeric_string_coercion(self):
        # Rule: active_power_w >= "7000" (string)
        self.add_rule("High Power", 10, {
            "target_class": "EnergyConsumer",
            "conditions": [
                {"path": "active_power_w", "op": ">=", "value": "7000"}
            ]
        }, "PowerViolation")

        # Test node with float value 8500.0 - should match even though rule value is string
        node_match = {
            "attached_equipment": [
                {
                    "cim_class": "EnergyConsumer",
                    "active_power_w": 8500.0
                }
            ]
        }
        res = self.engine.classify_node(node_match)
        self.assertIsNotNone(res)
        self.assertEqual(res["visual_type"], "PowerViolation")

        # Test node with type instead of cim_class
        node_match_type = {
            "attached_equipment": [
                {
                    "type": "EnergyConsumer",
                    "active_power_w": 8500.0
                }
            ]
        }
        res = self.engine.classify_node(node_match_type)
        self.assertIsNotNone(res)
        self.assertEqual(res["visual_type"], "PowerViolation")

if __name__ == '__main__':
    unittest.main()
