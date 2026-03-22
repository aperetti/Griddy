import sqlite3
import os

db_path = "c:\\Users\\adamp\\Development\\graph\\admin-console\\admin-backend\\admin.sqlite"

def init_display_tables():
    print(f"Initializing display tables in {db_path}")
    conn = sqlite3.connect(db_path)
    
    conn.execute("""
        CREATE TABLE IF NOT EXISTS display_configs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            is_default INTEGER DEFAULT 0,
            owner_user_id TEXT,
            is_readonly INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    conn.execute("""
        CREATE TABLE IF NOT EXISTS display_config_rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            config_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            priority INTEGER DEFAULT 0,
            match_conditions TEXT NOT NULL,
            visual_type TEXT NOT NULL,
            icon TEXT,
            color TEXT,
            FOREIGN KEY (config_id) REFERENCES display_configs (id) ON DELETE CASCADE
        )
    """)
    
    # Check if we need to seed
    cursor = conn.cursor()
    cursor.execute("SELECT count(*) FROM display_configs")
    if cursor.fetchone()[0] == 0:
        print("Seeding default display configuration...")
        cursor.execute("""
            INSERT INTO display_configs (name, description, is_default, is_readonly)
            VALUES ('Default Grid View', 'Standard system display rules', 1, 1)
        """)
        config_id = cursor.lastrowid
        
        rules = [
            ('Regulator', 100, '{"equipment_type": "PowerTransformer", "properties": {"name": "Regulator"}}', 'Regulator', 'mdi:transformer', '#FF7800'),
            ('Recloser', 90, '{"equipment_type": "Recloser"}', 'Recloser', 'mdi:switch', '#00C8FF')
        ]
        
        for name, priority, match_conditions, visual_type, icon, color in rules:
            cursor.execute("""
                INSERT INTO display_config_rules (config_id, name, priority, match_conditions, visual_type, icon, color)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (config_id, name, priority, match_conditions, visual_type, icon, color))
            
    conn.commit()
    conn.close()
    print("Initialization complete.")

if __name__ == "__main__":
    init_display_tables()
