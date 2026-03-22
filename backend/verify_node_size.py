import sys
import os

# Add src to path
sys.path.append(os.getcwd())

from src.grid.display_rule_engine import DisplayRuleEngine

def verify_node_size():
    admin_db = r"C:\Users\adamp\Development\graph\admin-console\admin-backend\admin.sqlite"
    engine = DisplayRuleEngine(admin_db)
    
    # Sample node for Customers (EnergyConsumer)
    node_data = {
        "node_id": "test_node_1",
        "node_type": "Bus", # Node type is Bus, but equipment is EnergyConsumer
        "attached_equipment": [
            {
                "mrid": "ec_1",
                "type": "EnergyConsumer",
                "name": "Test Customer"
            }
        ]
    }
    
    res = engine.classify_node(node_data)
    print(f"Classification result: {res}")

if __name__ == "__main__":
    verify_node_size()
