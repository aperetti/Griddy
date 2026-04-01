import { FastifyInstance } from 'fastify';
import { getDb } from '../../shared/database.js';

const MAIN_BACKEND_URL = process.env.MAIN_BACKEND_URL || 'http://localhost:8000';

export async function pluginsRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (_request, reply) => {
    try {
      const response = await fetch(`${MAIN_BACKEND_URL}/api/plugins/registry`);
      if (!response.ok) {
        return reply.status(502).send({ error: 'Failed to reach main backend' });
      }
      const registry = await response.json() as { name: string; enabled: boolean }[];

      const db = await getDb();
      const configs: { key: string; value: string }[] = await db.all(
        "SELECT key, value FROM config_overrides WHERE key LIKE 'plugin.%.enabled'"
      );
      const overrides = new Map(configs.map(c => [c.key, c.value]));

      return registry.map(plugin => ({
        name: plugin.name,
        enabled: (overrides.get(`plugin.${plugin.name}.enabled`) ?? String(plugin.enabled)) === 'true',
      }));
    } catch {
      return reply.status(502).send({ error: 'Main backend unreachable' });
    }
  });

  fastify.put<{ Params: { name: string }; Body: { enabled: boolean } }>(
    '/:name/enabled',
    async (request, reply) => {
      const { name } = request.params;
      const { enabled } = request.body;
      const db = await getDb();
      await db.run(
        'INSERT OR REPLACE INTO config_overrides (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
        [`plugin.${name}.enabled`, String(enabled)]
      );
      return { success: true };
    }
  );
}
