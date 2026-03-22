import os
import sys
import json
import sqlite3

# Add src to path
sys.path.append(os.getcwd())

from src.grid.display_rule_engine import DisplayRuleEngine
from src.shared.database_setup import ADMIN_SQLITE_PATH

def verify():
    print(f"Using DB: {ADMIN_SQLITE_PATH}")
    engine = DisplayRuleEngine(ADMIN_SQLITE_PATH)
    
    # Check current rules
    print(f"Loaded {len(engine._rules)} rules")
    for r in engine._rules:
        print(f" - Rule: {r['name']} (Priority: {r['priority']})")
    
    # Simulate a node match for EnergyConsumer (Rule #1)
    node_data = {
        "attached_equipment": [{"type": "EnergyConsumer"}]
    }
    res = engine.classify_node(node_data)
    print(f"Classification for EnergyConsumer: {json.dumps(res, indent=2) if res else 'None'}")
    
    # Robustness test: pass dict instead of string in a rule-like context
    print("\nRobustness test...")
    fake_rule = {
        "name": "Test",
        "match_conditions": {"target_class": "Test", "conditions": []},
        "visual_type": "TestType"
    }
    # This shouldn't crash with the new robust check
    match = engine._matches_rule(fake_rule, {"attached_equipment": [{"type": "Test"}]})
    print(f"Robust match result: {match}")
    
    print("\nVerification complete.")

if __name__ == "__main__":
    verify()
