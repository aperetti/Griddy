import { initializeTracing } from './shared/tracing.js';
initializeTracing();

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { dataRoutes } from './features/data/routes.js';
import { configRoutes } from './features/config/routes.js';
import { usersRoutes } from './features/users/routes.js';
import { pluginsRoutes } from './features/plugins/routes.js';
import { extensionsRoutes } from './features/extensions/routes.js';
import { setupTelemetryWatcher } from './shared/telemetry.js';
import { adminAuthHook } from './shared/auth.js';

// Setup error handlers early
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

const fastify = Fastify({
  logger: true,
  bodyLimit: 104857600
});

// Setup dynamic telemetry watcher
setupTelemetryWatcher(fastify);

// Register plugins
await fastify.register(cors, {
  origin: '*' // Adjust for production
});

// Secure administrative routes via a scoped register block
await fastify.register(async (apiContext) => {
  apiContext.addHook('preHandler', adminAuthHook);

  // Register protected routes (slices)
  await apiContext.register(dataRoutes, { prefix: '/api/data' });
  await apiContext.register(configRoutes, { prefix: '/api/display-rules' });
  await apiContext.register(usersRoutes, { prefix: '/api/users' });
  await apiContext.register(pluginsRoutes, { prefix: '/api/plugins' });
  await apiContext.register(extensionsRoutes, { prefix: '/api/extensions' });

  // Dynamic Telemetry Management
  apiContext.post('/admin/log-level', async (request, reply) => {
    const { level } = request.body as { level: string };
    if (level) {
      apiContext.log.level = level.toLowerCase();
      return { status: 'updated', level: apiContext.log.level };
    }
    return reply.status(400).send({ error: 'Level is required' });
  });
});

// Unprotected routes
fastify.get('/ping', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

const start = async () => {
  try {
    const port = Number(process.env.ADMIN_CONSOLE_PORT) || 8090;
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`Admin Console Backend listening on port ${port}`);
  } catch (err) {
    console.error('Fatal error during startup:', err);
    process.exit(1);
  }
};

start();
