import sqlite3
import os

ADMIN_SQLITE_PATH = r"c:\Users\adamp\Development\graph\admin-console\admin-backend\admin.sqlite"

def migrate():
    if not os.path.exists(ADMIN_SQLITE_PATH):
        print(f"Error: {ADMIN_SQLITE_PATH} not found.")
        return

    conn = sqlite3.connect(ADMIN_SQLITE_PATH)
    try:
        # Check if columns already exist
        cursor = conn.execute("PRAGMA table_info(display_config_rules)")
        columns = [row[1] for row in cursor.fetchall()]
        
        if "min_zoom" not in columns:
            print("Adding min_zoom column...")
            conn.execute("ALTER TABLE display_config_rules ADD COLUMN min_zoom FLOAT DEFAULT 0.0")
        
        if "max_zoom" not in columns:
            print("Adding max_zoom column...")
            conn.execute("ALTER TABLE display_config_rules ADD COLUMN max_zoom FLOAT DEFAULT 24.0")
            
        conn.commit()
        print("Migration successful.")
    except Exception as e:
        print(f"Migration failed: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
