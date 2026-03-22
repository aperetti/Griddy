import sqlite3
import json
import os

db_path = r'c:\Users\adamp\Development\graph\admin-console\admin-backend\admin.sqlite'

conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

cursor.execute("SELECT * FROM display_config_rules ORDER BY priority DESC")
rules = [dict(row) for row in cursor.fetchall()]

for r in rules:
    print(f"RULE: {r['name']} (Priority: {r['priority']})")
    print(f"  Visual: {r['visual_type']}")
    print(f"  Size: {r['size']}")
    print(f"  Conditions: {r['match_conditions']}")
    if r['icon']:
        print(f"  Icon: {r['icon'][:30]}...")
    print("-" * 20)

conn.close()
