import sqlite3
import json
import os

RULES_DB_PATH = "/data/config/rules.sqlite"
if not os.path.exists(RULES_DB_PATH):
    # Try local path for dev
    RULES_DB_PATH = "admin-console/admin-backend/rules.sqlite"

def check_rules():
    if not os.path.exists(RULES_DB_PATH):
        print(f"Error: {RULES_DB_PATH} not found")
        return

    conn = sqlite3.connect(RULES_DB_PATH)
    conn.row_factory = sqlite3.Row
    
    print("--- Display Configs ---")
    configs = conn.execute("SELECT * FROM display_configs").fetchall()
    for c in configs:
        print(f"ID: {c['id']}, Name: {c['name']}, Default: {c['is_default']}")
    
    print("\n--- Active Rules for Default ---")
    default_config = conn.execute("SELECT id FROM display_configs WHERE is_default = 1").fetchone()
    if default_config:
        rules = conn.execute("SELECT id, name, enabled FROM display_config_rules WHERE config_id = ?", (default_config['id'],)).fetchall()
        for r in rules:
            print(f"ID: {r['id']}, Name: {r['name']}, Enabled: {r['enabled']}")
    else:
        print("No default config found!")

    conn.close()

if __name__ == "__main__":
    check_rules()
