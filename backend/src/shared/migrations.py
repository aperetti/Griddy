"""Database Migration Logic.

This module handles schema updates and complex transformations for the 
SQLite admin and topology databases.
"""
import json
import sqlite3

def run_admin_migrations(conn: sqlite3.Connection):
    """Handles schema updates for the admin database (display rules, configs, etc.)."""
    
    # ── Migration: table_info check ───────────────────────────────────
    cursor = conn.execute("PRAGMA table_info(display_config_rules)")
    columns = [col[1] for col in cursor.fetchall()]
    
    # ── Migration 1: Robust display_config_rules transformation ────────
    if "visual_type" in columns:
        print("Migrating display_config_rules: Removing 'visual_type' and consolidating into 'config'...")
        # SQLite doesn't support DROP COLUMN, so we do the full table migration
        # This will preserve existing rules by mapping visual_type -> JSON config
        conn.execute("BEGIN TRANSACTION")
        try:
            # 1. Create the new table
            conn.execute("""
                CREATE TABLE display_config_rules_new (
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
            
            # 2. Copy data, mapping visual_type to config if config is NULL
            conn.execute("""
                INSERT INTO display_config_rules_new (id, config_id, name, priority, match_conditions, config, enabled, created_at, updated_at)
                SELECT id, config_id, name, priority, match_conditions, 
                       COALESCE(config, '{"visual_type": "' || visual_type || '"}'), 
                       enabled, created_at, updated_at
                FROM display_config_rules
            """)
            
            # 3. Swap tables
            conn.execute("DROP TABLE display_config_rules")
            conn.execute("ALTER TABLE display_config_rules_new RENAME TO display_config_rules")
            conn.commit()
            print("Successfully migrated display_config_rules table.")
        except Exception as e:
            conn.rollback()
            print(f"Error migrating display_config_rules: {e}")
            raise
    else:
        # Standard column additions if the table was created without visual_type
        if "config" not in columns:
            print("Migrating display_config_rules: Adding 'config' column...")
            conn.execute("ALTER TABLE display_config_rules ADD COLUMN config TEXT")
        
        if "match_conditions" not in columns:
            print("Migrating display_config_rules: Adding 'match_conditions' column...")
            conn.execute("ALTER TABLE display_config_rules ADD COLUMN match_conditions TEXT")
            
        if "priority" not in columns:
            print("Migrating display_config_rules: Adding 'priority' column...")
            conn.execute("ALTER TABLE display_config_rules ADD COLUMN priority INTEGER DEFAULT 0")

    # ── Migration 2: Ensure at least one default config exists ────────
    cursor = conn.execute("SELECT COUNT(*) FROM display_configs")
    if cursor.fetchone()[0] == 0:
        conn.execute("INSERT INTO display_configs (name, is_default) VALUES (?, ?)", ('Default Profile', 1))
        print("Seeded default display profile.")

    conn.commit()
