import sys
import os
from pathlib import Path

# Add src to path
sys.path.append(str(Path(os.getcwd()) / "backend"))

from src.grid.display_rule_engine import DisplayRuleEngine
from src.shared.database_setup import ADMIN_SQLITE_PATH

def test_engine():
    print(f"Testing DisplayRuleEngine with DB: {ADMIN_SQLITE_PATH}")
    if not os.path.exists(ADMIN_SQLITE_PATH):
        print(f"Error: Admin DB not found at {ADMIN_SQLITE_PATH}")
        return

    engine = DisplayRuleEngine(ADMIN_SQLITE_PATH)
    print(f"Rules loaded: {len(engine._rules)}")
    for rule in engine._rules:
        print(f"  Rule: {rule['name']} -> {rule['visual_type']} (Priority: {rule['priority']})")
        print(f"    Conditions: {rule['match_conditions']}")

    # Test cases
    test_node_regulator = {
        "attached_equipment": [{"type": "PowerTransformer", "name": "Substation Regulator 1"}],
        "node_type": "Bus"
    }
    
    test_node_recloser = {
        "attached_equipment": [{"type": "Recloser", "name": "Line Recloser R123"}],
        "node_type": "Bus"
    }

    test_node_normal = {
        "attached_equipment": [{"type": "PowerTransformer", "name": "Normal Xfmr"}],
        "node_type": "Bus"
    }

    print("\nClassification Tests:")
    print(f"  Regulator node -> {engine.classify_node(test_node_regulator)}")
    print(f"  Recloser node -> {engine.classify_node(test_node_recloser)}")
    print(f"  Normal node -> {engine.classify_node(test_node_normal)}")

if __name__ == "__main__":
    test_engine()
