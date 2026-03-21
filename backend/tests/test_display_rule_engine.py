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
                match_edge_types TEXT
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

    def add_rule(self, name, priority, conditions, visual_type, match_equipment=None, match_edge_types=None):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO display_config_rules 
            (config_id, name, priority, match_conditions, visual_type, match_equipment, match_edge_types)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            self.config_id, name, priority, 
            json.dumps(conditions) if isinstance(conditions, dict) else conditions,
            visual_type, 
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
        self.assertEqual(self.engine.classify_node(node_big), "HugeTransformer")

        # Test node with multiple items, one matches
        node_mixed = {
            "attached_equipment": [
                {"type": "PowerTransformer", "attributes": {"ratedS": 100}},
                {"type": "PowerTransformer", "attributes": {"ratedS": 1000}}
            ]
        }
        self.assertEqual(self.engine.classify_node(node_mixed), "HugeTransformer")

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
        self.assertEqual(self.engine.classify_edge(edge_long), "TransmissionLine")

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
        self.assertEqual(self.engine.classify_node(node_match), "SpecialXFR")

if __name__ == '__main__':
    unittest.main()
