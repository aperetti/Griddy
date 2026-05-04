import sqlite3
import json
import os
import sys
from pathlib import Path

# Add src to path so we can import dependencies if needed
sys.path.append(str(Path(__file__).resolve().parents[1]))

from src.shared.dependencies import RULES_DB_PATH

def migrate():
    print(f"Starting migration for {RULES_DB_PATH}...")
    
    if not os.path.exists(RULES_DB_PATH):
        print(f"Database not found at {RULES_DB_PATH}")
        return

    conn = sqlite3.connect(RULES_DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # 1. Check if the table exists or if it's already migrated
    try:
        cursor.execute("SELECT config FROM display_config_rules LIMIT 1")
        print("Table 'display_config_rules' already has 'config' column. Checking if we need to collapse data...")
        # If it exists, we might still need to migrate data if old columns are still there
    except sqlite3.OperationalError:
        print("Column 'config' not found. Proceeding with migration.")

    # 2. Get all existing rules
    cursor.execute("SELECT * FROM display_config_rules")
    rows = cursor.fetchall()
    print(f"Found {len(rows)} rules to migrate.")

    migrated_rules = []
    for row in rows:
        d = dict(row)
        
        # Define fields to collapse into JSON
        config_fields = [
            'visual_type', 'icon', 'color_hex', 'size', 'label', 
            'css_overrides', 'radial_offset', 'cluster_enabled', 
            'cluster_radius', 'cluster_max_zoom', 'cluster_min_points', 
            'min_zoom', 'max_zoom'
        ]
        
        config_data = {}
        for field in config_fields:
            val = d.get(field)
            if field == 'css_overrides' and val:
                try: 
                    config_data[field] = json.loads(val)
                except: 
                    config_data[field] = []
            elif field in ('cluster_enabled', 'enabled'): # enabled is actually top-level but good to check
                config_data[field] = bool(val)
            else:
                config_data[field] = val
        
        # Top level fields
        new_rule = {
            'id': d['id'],
            'config_id': d['config_id'],
            'name': d['name'],
            'priority': d['priority'],
            'enabled': d['enabled'],
            'match_conditions': d['match_conditions'],
            'config': json.dumps(config_data),
            'created_at': d['created_at'],
            'updated_at': d['updated_at']
        }
        migrated_rules.append(new_rule)

    # 3. Recreate the table
    print("Recreating table 'display_config_rules'...")
    conn.execute("BEGIN TRANSACTION")
    try:
        conn.execute("DROP TABLE display_config_rules")
        conn.execute("""
            CREATE TABLE display_config_rules (
                id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                config_id           INTEGER NOT NULL REFERENCES display_configs(id) ON DELETE CASCADE,
                name                TEXT NOT NULL,
                priority            INTEGER DEFAULT 0,
                match_conditions    TEXT,
                config              TEXT,
                enabled             INTEGER DEFAULT 1,
                created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # 4. Insert migrated data
        for r in migrated_rules:
            conn.execute("""
                INSERT INTO display_config_rules 
                (id, config_id, name, priority, match_conditions, config, enabled, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (r['id'], r['config_id'], r['name'], r['priority'], r['match_conditions'], r['config'], r['enabled'], r['created_at'], r['updated_at']))
        
        conn.commit()
        print("Migration successful.")
    except Exception as e:
        conn.rollback()
        print(f"Migration failed: {e}")
        raise e
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
