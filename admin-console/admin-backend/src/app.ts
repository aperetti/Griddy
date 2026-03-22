import Fastify from 'fastify';
import cors from '@fastify/cors';
import { dataRoutes } from './features/data/routes.js';
import { configRoutes } from './features/config/routes.js';

const fastify = Fastify({
  logger: true
});

// Register plugins
await fastify.register(cors, {
  origin: '*' // Adjust for production
});

// Register routes (slices)
await fastify.register(dataRoutes, { prefix: '/api/data' });
await fastify.register(configRoutes, { prefix: '/api/config' });
fastify.get('/ping', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

const start = async () => {
  try {
    const port = Number(process.env.ADMIN_CONSOLE_PORT) || 8090;
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`Admin Console Backend listening on port ${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
