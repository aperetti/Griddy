import { FastifyInstance } from 'fastify';
import { getDb } from '../../shared/database.js';

interface RuleConfig {
  visual_type: string;
  icon?: string;
  color_hex?: string;
  size?: number;
  label?: string;
  svg_overrides?: any[];
  [key: string]: any;
}

interface DisplayRule {
  id?: number;
  config_id: number;
  name: string;
  priority: number;
  match_conditions: any;
  enabled: boolean;
  config: RuleConfig;
}

export async function configRoutes(fastify: FastifyInstance) {
  
  // ── Config Overrides (Legacy/Shared) ───────────────────────────
  fastify.get('/overrides', async () => {
    const db = await getDb();
    return db.all('SELECT * FROM config_overrides');
  });

  fastify.post('/overrides', async (request, reply) => {
    const { key, value } = request.body as { key: string, value: string };
    const db = await getDb();
    await db.run(
      'INSERT OR REPLACE INTO config_overrides (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      [key, value]
    );
    return { success: true };
  });

  // ── Display Profiles (Configs) ──────────────────────────────────
  
  // List all profiles
  fastify.get('/configs', async () => {
    const db = await getDb();
    const rows = await db.all(`
      SELECT 
        c.*,
        (SELECT COUNT(*) FROM display_config_rules WHERE config_id = c.id) as rules_count
      FROM display_configs c
      ORDER BY c.is_default DESC, c.name ASC
    `);
    return rows.map(r => ({ ...r, is_default: !!r.is_default, is_readonly: !!r.is_readonly }));
  });

  // Create profile
  fastify.post('/configs', async (request, reply) => {
    const { name, description } = request.body as { name: string, description?: string };
    const db = await getDb();
    const result = await db.run(
      'INSERT INTO display_configs (name, description, is_default) VALUES (?, ?, 0)',
      [name, description || '']
    );
    const newId = result.lastID;
    return db.get('SELECT * FROM display_configs WHERE id = ?', [newId]);
  });

  // Update profile metadata (e.g. rename)
  fastify.put('/configs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { name, description } = request.body as { name: string, description?: string };
    const db = await getDb();
    
    const result = await db.run(
      'UPDATE display_configs SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [name, description || '', id]
    );
    
    if (result.changes === 0) return reply.status(404).send({ error: 'Config not found' });
    return db.get('SELECT * FROM display_configs WHERE id = ?', [id]);
  });

  // Set default profile
  fastify.put('/configs/:id/set-default', async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = await getDb();
    
    await db.run('BEGIN TRANSACTION');
    try {
      await db.run('UPDATE display_configs SET is_default = 0');
      const result = await db.run('UPDATE display_configs SET is_default = 1 WHERE id = ?', [id]);
      if (result.changes === 0) {
        await db.run('ROLLBACK');
        return reply.status(404).send({ error: 'Config not found' });
      }
      await db.run('COMMIT');
      return { success: true };
    } catch (err) {
      await db.run('ROLLBACK');
      throw err;
    }
  });

  // Delete profile
  fastify.delete('/configs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = await getDb();
    const config = await db.get('SELECT is_default FROM display_configs WHERE id = ?', [id]);
    if (!config) return reply.status(404).send({ error: 'Config not found' });
    if (config.is_default) return reply.status(400).send({ error: 'Cannot delete default config' });
    
    await db.run('DELETE FROM display_configs WHERE id = ?', [id]);
    return { success: true };
  });

  // ── Rules Management ────────────────────────────────────────────

  // Get rules for a config
  fastify.get('/configs/:configId/rules', async (request, reply) => {
    const { configId } = request.params as { configId: string };
    const db = await getDb();
    const rows = await db.all(
      'SELECT * FROM display_config_rules WHERE config_id = ? ORDER BY priority DESC, name ASC',
      [configId]
    );
    return rows.map(r => ({
      ...r,
      enabled: !!r.enabled,
      match_conditions: r.match_conditions ? JSON.parse(r.match_conditions) : {},
      config: r.config ? JSON.parse(r.config) : {}
    }));
  });

  // Create rule for a config
  fastify.post('/configs/:configId/rules', async (request, reply) => {
    const { configId } = request.params as { configId: string };
    const rule = request.body as DisplayRule;
    const db = await getDb();
    
    const result = await db.run(
      `INSERT INTO display_config_rules (config_id, name, priority, match_conditions, config, enabled) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        configId, 
        rule.name, 
        rule.priority || 0, 
        JSON.stringify(rule.match_conditions || {}), 
        JSON.stringify(rule.config || {}), 
        rule.enabled === false ? 0 : 1
      ]
    );
    
    const newId = result.lastID;
    const newRow = await db.get('SELECT * FROM display_config_rules WHERE id = ?', [newId]);
    return {
      ...newRow,
      enabled: !!newRow.enabled,
      match_conditions: JSON.parse(newRow.match_conditions),
      config: JSON.parse(newRow.config)
    };
  });

  // Update a rule
  fastify.put('/rules/:ruleId', async (request, reply) => {
    const { ruleId } = request.params as { ruleId: string };
    const rule = request.body as DisplayRule;
    const db = await getDb();
    
    const result = await db.run(
      `UPDATE display_config_rules SET 
        name = ?, 
        priority = ?, 
        match_conditions = ?, 
        config = ?, 
        enabled = ?,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        rule.name, 
        rule.priority, 
        JSON.stringify(rule.match_conditions || {}), 
        JSON.stringify(rule.config || {}), 
        rule.enabled ? 1 : 0, 
        ruleId
      ]
    );
    
    if (result.changes === 0) return reply.status(404).send({ error: 'Rule not found' });
    const updated = await db.get('SELECT * FROM display_config_rules WHERE id = ?', [ruleId]);
    return {
      ...updated,
      enabled: !!updated.enabled,
      match_conditions: JSON.parse(updated.match_conditions),
      config: JSON.parse(updated.config)
    };
  });

  // Delete a rule
  fastify.delete('/rules/:ruleId', async (request, reply) => {
    const { ruleId } = request.params as { ruleId: string };
    const db = await getDb();
    await db.run('DELETE FROM display_config_rules WHERE id = ?', [ruleId]);
    return { success: true };
  });

  // Duplicate a rule
  fastify.post('/rules/:ruleId/duplicate', async (request, reply) => {
    const { ruleId } = request.params as { ruleId: string };
    const db = await getDb();
    
    const rule = await db.get('SELECT * FROM display_config_rules WHERE id = ?', [ruleId]);
    if (!rule) return reply.status(404).send({ error: 'Rule not found' });
    
    const result = await db.run(
      `INSERT INTO display_config_rules (config_id, name, priority, match_conditions, config, enabled) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [rule.config_id, `${rule.name} (Copy)`, rule.priority, rule.match_conditions, rule.config, rule.enabled]
    );
    
    const newId = result.lastID;
    return { id: newId, name: `${rule.name} (Copy)` };
  });

  // ── Import/Export ──────────────────────────────────────────────

  // Export a profile (config + all rules)
  fastify.get('/configs/:id/export', async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = await getDb();
    
    const config = await db.get('SELECT * FROM display_configs WHERE id = ?', [id]);
    if (!config) return reply.status(404).send({ error: 'Config not found' });
    
    const rules = await db.all('SELECT * FROM display_config_rules WHERE config_id = ?', [id]);
    
    const exportData = {
      profile: {
        name: config.name,
        description: config.description,
      },
      rules: rules.map(r => ({
        name: r.name,
        priority: r.priority,
        match_conditions: JSON.parse(r.match_conditions),
        config: JSON.parse(r.config),
        enabled: !!r.enabled
      }))
    };
    
    return exportData;
  });

  // Import a profile
  fastify.post('/configs/import', async (request, reply) => {
    const data = request.body as any;
    if (!data.profile || !data.rules) {
      return reply.status(400).send({ error: 'Invalid import format. Expected "profile" and "rules" keys.' });
    }
    
    const db = await getDb();
    await db.run('BEGIN TRANSACTION');
    
    try {
      // Create new profile (allowing duplicate names by appending timestamp/copy)
      let name = data.profile.name;
      const existing = await db.get('SELECT id FROM display_configs WHERE name = ?', [name]);
      if (existing) {
        name = `${name} (Imported ${new Date().toISOString().slice(0, 10)})`;
      }
      
      const configResult = await db.run(
        'INSERT INTO display_configs (name, description, is_default) VALUES (?, ?, 0)',
        [name, data.profile.description || '']
      );
      const configId = configResult.lastID;
      
      // Import rules
      for (const rule of data.rules) {
        await db.run(
          `INSERT INTO display_config_rules (config_id, name, priority, match_conditions, config, enabled) 
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            configId, 
            rule.name, 
            rule.priority || 0, 
            JSON.stringify(rule.match_conditions || {}), 
            JSON.stringify(rule.config || {}), 
            rule.enabled ? 1 : 0
          ]
        );
      }
      
      await db.run('COMMIT');
      return db.get('SELECT * FROM display_configs WHERE id = ?', [configId]);
    } catch (err) {
      await db.run('ROLLBACK');
      throw err;
    }
  });

}
