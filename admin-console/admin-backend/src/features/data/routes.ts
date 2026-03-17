import { FastifyInstance } from 'fastify';
import { runCommand } from '../../shared/shell.js';
import path from 'path';

export async function dataRoutes(fastify: FastifyInstance) {
  fastify.post('/generate', async (request, reply) => {
    const scriptPath = path.join(process.cwd(), '..', '..', 'backend', 'scripts', 'generate_synthetic_data.py');
    // We execute in background and return job ID?
    // For now, simple execution
    const result = await runCommand(`python ${scriptPath}`);
    return { 
      success: result.stderr === '', 
      output: result.stdout, 
      error: result.stderr 
    };
  });

  fastify.post('/ingest', async (request, reply) => {
    const scriptPath = path.join(process.cwd(), '..', '..', 'backend', 'scripts', 'ingest_cim_graph.py');
    const result = await runCommand(`python ${scriptPath}`);
    return { 
      success: result.stderr === '', 
      output: result.stdout, 
      error: result.stderr 
    };
  });
}
