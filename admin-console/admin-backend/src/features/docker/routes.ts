import { FastifyInstance } from 'fastify';
import docker from '../../shared/docker.js';

export async function dockerRoutes(fastify: FastifyInstance) {
  fastify.get('/status', async () => {
    const containers = await docker.listContainers({ all: true });
    return containers.map(c => ({
      id: c.Id,
      name: c.Names[0],
      image: c.Image,
      status: c.Status,
      state: c.State
    }));
  });

  fastify.post('/restart/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const container = docker.getContainer(id);
      await container.restart();
      return { success: true };
    } catch (err: any) {
      reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/pull', async (request, reply) => {
    // In a real scenario, this would use docker-compose pull or similar
    // For now, we'll simulate a long-running process
    return { message: "Pulling latest images started (Simulated)" };
  });
}
