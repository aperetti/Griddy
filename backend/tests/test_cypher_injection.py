import unittest
from src.grid.cypher_builder import CypherRuleBuilder

class TestCypherInjection(unittest.TestCase):
    def setUp(self):
        self.builder = CypherRuleBuilder()

    def test_unsafe_class(self):
        with self.assertRaises(ValueError) as context:
            self.builder.build_rule_query(
                {"path_steps": [{"id": "s1", "class": "PowerTransformer` RETURN 1 //"}]},
                "PowerTransformer"
            )
        self.assertIn("Invalid class identifier in path", str(context.exception))

    def test_unsafe_target_class_traversal(self):
        with self.assertRaises(ValueError) as context:
            self.builder.build_rule_query(
                {"conditions": [{"path": "Substation.name", "op": "==", "value": "Test", "graph_path": []}]},
                "PowerTransformer` MATCH (n) DETACH DELETE n //"
            )
        self.assertIn("Invalid CIM class identifier", str(context.exception))

if __name__ == '__main__':
    unittest.main()
