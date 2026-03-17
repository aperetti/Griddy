import { describe, it, expect, beforeAll } from 'vitest';
import Fastify from 'fastify';
import { dockerRoutes } from './routes.js';

describe('Docker Routes', () => {
  let app: any;

  beforeAll(async () => {
    app = Fastify();
    await app.register(dockerRoutes);
  });

  it('GET /status should return container list', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/status'
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(Array.isArray(body)).toBe(true);
  });
});
