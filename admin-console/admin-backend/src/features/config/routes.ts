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
}
