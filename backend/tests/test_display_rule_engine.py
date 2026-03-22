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
                id INTEGER PRIMARY KEY, 
                config_id INTEGER, 
                name TEXT, 
                priority INTEGER, 
                match_conditions TEXT, 
                visual_type TEXT,
                match_equipment TEXT,
                match_edge_types TEXT,
                size REAL,
                label TEXT
            )
        """)
        
        # Add default config
        cursor.execute("INSERT INTO display_configs (name, is_default) VALUES ('Default', 1)")
        self.config_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        self.engine = DisplayRuleEngine(self.db_path)

    def tearDown(self):
        os.close(self.db_fd)
        os.unlink(self.db_path)

    def add_rule(self, name, priority, conditions, visual_type, match_equipment=None, match_edge_types=None, size=1.0, label=""):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO display_config_rules 
            (config_id, name, priority, match_conditions, visual_type, match_equipment, match_edge_types, size, label)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            self.config_id, name, priority, 
            json.dumps(conditions) if isinstance(conditions, dict) else conditions,
            visual_type, 
            json.dumps(match_equipment) if match_equipment else None,
            json.dumps(match_edge_types) if match_edge_types else None,
            size,
            label
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

if __name__ == '__main__':
    unittest.main()
