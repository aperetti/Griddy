import { FastifyInstance } from 'fastify';
import { getDb } from '../../shared/database.js';

export async function configRoutes(fastify: FastifyInstance) {
  fastify.get('/', async () => {
    const db = await getDb();
    return db.all('SELECT * FROM config_overrides');
  });

  fastify.post('/', async (request, reply) => {
    const { key, value } = request.body as { key: string, value: string };
    const db = await getDb();
    await db.run(
      'INSERT OR REPLACE INTO config_overrides (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      [key, value]
    );
    return { success: true };
  });

  // ── Display Profiles ───────────────────────────────────────────
  fastify.get('/display-profiles', async () => {
    const db = await getDb();
    // Join with rules to get a count, making it more informative
    return db.all(`
      SELECT 
        c.*,
        (SELECT COUNT(*) FROM display_config_rules WHERE config_id = c.id) as rules_count
      FROM display_configs c
      ORDER BY c.is_default DESC, c.name ASC
    `);
  });

  fastify.post('/display-profiles/:id/activate', async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = await getDb();
    
    await db.run('BEGIN TRANSACTION');
    try {
      await db.run('UPDATE display_configs SET is_default = 0');
      const result = await db.run('UPDATE display_configs SET is_default = 1 WHERE id = ?', [id]);
      
      if (result.changes === 0) {
        await db.run('ROLLBACK');
        return reply.status(404).send({ error: 'Profile not found' });
      }
      
      await db.run("UPDATE display_configs SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);
      await db.run('COMMIT');
      return { success: true };
    } catch (err) {
      await db.run('ROLLBACK');
      throw err;
    }
  });

  fastify.delete('/display-profiles/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = await getDb();

    // Prevent deleting the active profile
    const profile = await db.get('SELECT is_default FROM display_configs WHERE id = ?', [id]);
    if (!profile) return reply.status(404).send({ error: 'Profile not found' });
    if (profile.is_default) return reply.status(400).send({ error: 'Cannot delete the active profile' });

    await db.run('DELETE FROM display_configs WHERE id = ?', [id]);
    return { success: true };
  });
}
