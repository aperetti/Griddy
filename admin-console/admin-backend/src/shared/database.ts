import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';

let db: Database | null = null;

export async function getDb(): Promise<Database> {
  if (db) return db;

  const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'admin.sqlite');
  
  db = await open({
    filename: dbPath,
    driver: sqlite3.Database as any
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      result TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS config_overrides (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS display_configs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL UNIQUE,
      description   TEXT,
      is_default    INTEGER DEFAULT 0,
      owner_user_id TEXT,
      is_readonly   INTEGER DEFAULT 0,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS display_config_rules (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      config_id           INTEGER NOT NULL REFERENCES display_configs(id) ON DELETE CASCADE,
      name                TEXT NOT NULL,
      priority            INTEGER DEFAULT 0,
      match_conditions    TEXT,
      config              TEXT,
      enabled             INTEGER DEFAULT 1,
      created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // ── Migration: Robust display_config_rules transformation ──────────
  const columns = await db.all("PRAGMA table_info(display_config_rules)");
  const hasVisualType = columns.some(c => c.name === 'visual_type');
  
  if (hasVisualType) {
    console.log("Migrating display_config_rules: Removing 'visual_type' and consolidating into 'config'...");
    try {
      await db.run("BEGIN TRANSACTION");
      
      // 1. Create the new table
      await db.exec(`
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
      `);
      
      // 2. Copy data, mapping visual_type to config JSON
      await db.run(`
        INSERT INTO display_config_rules_new (id, config_id, name, priority, match_conditions, config, enabled, created_at, updated_at)
        SELECT id, config_id, name, priority, match_conditions, 
               COALESCE(config, '{"visual_type": "' || visual_type || '"}'), 
               enabled, created_at, updated_at
        FROM display_config_rules
      `);
      
      // 3. Swap
      await db.run("DROP TABLE display_config_rules");
      await db.run("ALTER TABLE display_config_rules_new RENAME TO display_config_rules");
      
      await db.run("COMMIT");
      console.log("Successfully migrated display_config_rules table.");
    } catch (err) {
      await db.run("ROLLBACK");
      console.error("Error migrating display_config_rules:", err);
      // We don't throw here to avoid preventing startup, but rule import may fail
    }
  } else {
    // Fallback for incremental updates (if table was created without visual_type)
    const migrations = [
      'ALTER TABLE display_config_rules ADD COLUMN match_conditions TEXT',
      'ALTER TABLE display_config_rules ADD COLUMN config TEXT',
      'ALTER TABLE display_config_rules ADD COLUMN priority INTEGER DEFAULT 0'
    ];
    for (const sql of migrations) {
      try { await db.run(sql); } catch (e) { /* ignore */ }
    }
  }

  // Seed default display config if none exists
  const existing = await db.get('SELECT id FROM display_configs LIMIT 1');
  if (!existing) {
    await db.run(
      `INSERT INTO display_configs (name, description, is_default) VALUES (?, ?, 1)`,
      'Default', 'System default display configuration'
    );
    const configRow = await db.get('SELECT id FROM display_configs WHERE name = ?', 'Default');
    if (configRow) {
      const configId = configRow.id;
      
      // Seed a Regulator rule using the new match_conditions and config format
      await db.run(
        `INSERT INTO display_config_rules (config_id, name, priority, match_conditions, config)
         VALUES (?, ?, ?, ?, ?)`,
        configId, 'Regulator', 10,
        JSON.stringify({ 
          target_class: 'PowerTransformer', 
          conditions: [{ path: 'is_regulator', op: '==', value: true }] 
        }),
        JSON.stringify({ visual_type: 'Regulator' })
      );
      
      await db.run(
        `INSERT INTO display_config_rules (config_id, name, priority, match_conditions, config)
         VALUES (?, ?, ?, ?, ?)`,
        configId, 'Recloser', 5,
        JSON.stringify({
          target_class: 'Recloser',
          conditions: []
        }),
        JSON.stringify({ visual_type: 'Recloser' })
      );
    }
  }

  return db;
}
