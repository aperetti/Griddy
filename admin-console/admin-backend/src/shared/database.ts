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
      visual_type         TEXT NOT NULL,
      priority            INTEGER DEFAULT 0,
      match_edge_types    TEXT,
      match_equipment     TEXT,
      match_has_property  TEXT,
      match_conditions    TEXT,
      icon                TEXT,
      color_hex           TEXT,
      enabled             INTEGER DEFAULT 1,
      created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migration: ensure match_conditions exists in existing databases
  try {
    await db.run('ALTER TABLE display_config_rules ADD COLUMN match_conditions TEXT');
  } catch (e) {
    // If it already exists, this will fail, which is fine
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
      
      // Seed a Regulator rule using the new match_conditions format
      await db.run(
        `INSERT INTO display_config_rules (config_id, name, visual_type, priority, match_conditions)
         VALUES (?, ?, ?, ?, ?)`,
        configId, 'Regulator', 'Regulator', 10,
        JSON.stringify({ 
          target_class: 'PowerTransformer', 
          conditions: [{ path: 'is_regulator', op: '==', value: true }] 
        })
      );
      
      await db.run(
        `INSERT INTO display_config_rules (config_id, name, visual_type, priority, match_conditions)
         VALUES (?, ?, ?, ?, ?)`,
        configId, 'Recloser', 'Recloser', 5,
        JSON.stringify({
          target_class: 'Recloser',
          conditions: []
        })
      );
    }
  }

  return db;
}
