import sys
import os
from pathlib import Path

# Add src to path
sys.path.append(str(Path(__file__).resolve().parents[1]))

import unittest
from src.shared.cim_registry import CimModelRegistry

class TestCimSchema(unittest.TestCase):
    def setUp(self):
        # Reset registry to test fresh startup
        CimModelRegistry.reset()
        self.registry = CimModelRegistry.get_instance()

    def test_baseline_schema_at_startup(self):
        """Verify that we have a large baseline schema even before any models are loaded."""
        schema = self.registry.get_cim_schema()
        
        # Should have 300+ classes from the profile
        class_count = len(schema)
        print(f"Total baseline classes: {class_count}")
        self.assertGreater(class_count, 300)
        
        # Verify specific important classes are present
        self.assertIn("ACLineSegment", schema)
        self.assertIn("PowerTransformer", schema)
        self.assertIn("ConnectivityNode", schema)
        
        # Verify attributes for ACLineSegment
        ac_attrs = [a for a in schema["ACLineSegment"]["attributes"]]
        self.assertIn("mRID", ac_attrs)
        self.assertIn("length", ac_attrs)
        self.assertIn("r", ac_attrs)

    def test_acline_segment_connections(self):
        """Verify that ACLineSegment shows appropriate connections in the baseline."""
        connections = self.registry.get_class_connections("ACLineSegment")
        
        print(f"ACLineSegment Connections: {connections}")
        self.assertIn("ConnectivityNode", connections)
        self.assertIn("Fuse", connections)
        self.assertIn("Breaker", connections)
        self.assertIn("PowerTransformer", connections)

    def test_dynamic_connections(self):
        """Verify that loading a model adds dynamic connectivity info (if any discovered)."""
        # Load a small model
        self.registry.discover()
        models = self.registry.list_models()
        if not models:
            self.skipTest("No models available to test dynamic connectivity")
            
        model_id = models[0]["model_id"]
        print(f"Loading model for dynamic test: {model_id}")
        self.registry.load_model(model_id)
        
        # Connections for a class that actually exists in the model
        # Most of our models have EnergyConsumer
        connections = self.registry.get_class_connections("EnergyConsumer")
        self.assertIn("ConnectivityNode", connections)
        
        # Check if EnergyConsumer is connected to anything else (Transformers, etc)
        print(f"EnergyConsumer Connections in {model_id}: {connections}")

if __name__ == "__main__":
    unittest.main()
