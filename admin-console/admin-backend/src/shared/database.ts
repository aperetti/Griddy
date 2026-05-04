import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';

let adminDb: Database | null = null;
let rulesDb: Database | null = null;

/**
 * Gets the Admin database connection (users, overrides, jobs).
 */
export async function getAdminDb(): Promise<Database> {
  if (adminDb) return adminDb;

  const dbPath = process.env.ADMIN_DB_PATH || path.join(process.cwd(), 'admin.sqlite');
  
  adminDb = await open({
    filename: dbPath,
    driver: sqlite3.Database as any
  });

  await adminDb.exec(`
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

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  return adminDb;
}

/**
 * Gets the Rules database connection (profiles, display rules).
 */
export async function getRulesDb(): Promise<Database> {
  if (rulesDb) return rulesDb;

  const dbPath = process.env.RULES_DB_PATH || path.join(process.cwd(), 'rules.sqlite');
  
  rulesDb = await open({
    filename: dbPath,
    driver: sqlite3.Database as any
  });

  await rulesDb.exec(`
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
  `);

  // ── Migration Check ────────────────────────────────────────────────
  const columns = await rulesDb.all("PRAGMA table_info(display_config_rules)");
  const hasVisualType = columns.some(c => c.name === 'visual_type');
  
  if (hasVisualType) {
    console.log("Migrating display_config_rules in rules.sqlite...");
    try {
      await rulesDb.run("BEGIN TRANSACTION");
      await rulesDb.exec(`
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
      await rulesDb.run(`
        INSERT INTO display_config_rules_new (id, config_id, name, priority, match_conditions, config, enabled, created_at, updated_at)
        SELECT id, config_id, name, priority, match_conditions, 
               COALESCE(config, '{"visual_type": "' || visual_type || '"}'), 
               enabled, created_at, updated_at
        FROM display_config_rules
      `);
      await rulesDb.run("DROP TABLE display_config_rules");
      await rulesDb.run("ALTER TABLE display_config_rules_new RENAME TO display_config_rules");
      await rulesDb.run("COMMIT");
    } catch (err) {
      await rulesDb.run("ROLLBACK");
      console.error("Error migrating display_config_rules:", err);
    }
  }

  // Seed default display config if none exists
  const existing = await rulesDb.get('SELECT id FROM display_configs LIMIT 1');
  if (!existing) {
    await rulesDb.run(
      `INSERT INTO display_configs (name, description, is_default) VALUES (?, ?, 1)`,
      'Default', 'System default display configuration'
    );
    const configRow = await rulesDb.get('SELECT id FROM display_configs WHERE name = ?', 'Default');
    if (configRow) {
      const configId = configRow.id;
      await rulesDb.run(
        `INSERT INTO display_config_rules (config_id, name, priority, match_conditions, config)
         VALUES (?, ?, ?, ?, ?)`,
        configId, 'Regulator', 10,
        JSON.stringify({ target_class: 'PowerTransformer', conditions: [{ path: 'is_regulator', op: '==', value: true }] }),
        JSON.stringify({ visual_type: 'Regulator' })
      );
    }
  }

  return rulesDb;
}

// Deprecated: kept for temporary compatibility during route migration
export async function getDb(): Promise<Database> {
  return getAdminDb();
}
