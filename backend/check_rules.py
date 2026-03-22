import sqlite3
import json
import os

db_path = r'c:\Users\adamp\Development\graph\admin-console\admin-backend\admin.sqlite'

if not os.path.exists(db_path):
    print(f"Database not found at {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

print("--- Display Configs ---")
cursor.execute("SELECT * FROM display_configs")
for row in cursor.fetchall():
    print(dict(row))

print("\n--- Display Rules ---")
cursor.execute("SELECT * FROM display_config_rules ORDER BY priority DESC")
for row in cursor.fetchall():
    d = dict(row)
    # Truncate icon for readability
    if d['icon'] and len(d['icon']) > 50:
        d['icon'] = d['icon'][:50] + "..."
    print(d)

conn.close()
