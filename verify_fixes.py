
import sqlite3
import os

ADMIN_DB = "c:/Users/adamp/Development/graph/admin-console/admin-backend/admin.sqlite"

def verify_db_schema():
    if not os.path.exists(ADMIN_DB):
        print(f"FAILURE: Database file not found at {ADMIN_DB}")
        return

    conn = sqlite3.connect(ADMIN_DB)
    cursor = conn.cursor()
    try:
        cursor.execute("PRAGMA table_info(display_config_rules)")
        cols = [col[1] for col in cursor.fetchall()]
        print(f"Columns in display_config_rules: {cols}")
        if 'enabled' in cols:
            print("SUCCESS: 'enabled' column exists.")
        else:
            print("FAILURE: 'enabled' column missing.")
    except Exception as e:
        print(f"Error checking schema: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    verify_db_schema()
