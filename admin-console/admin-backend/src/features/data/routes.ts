import { FastifyInstance } from 'fastify';
import { runCommand } from '../../shared/shell.js';
import path from 'path';
import fs from 'fs';
import { pipeline } from 'stream/promises';
import multipart from '@fastify/multipart';

export async function dataRoutes(fastify: FastifyInstance) {
  // Register multipart support for this route group
  await fastify.register(multipart, {
    limits: {
      fileSize: 100 * 1024 * 1024 // 100MB limit
    }
  });

  fastify.post('/generate', async (request, reply) => {
    const scriptPath = path.join(process.cwd(), '..', '..', 'backend', 'scripts', 'generate_all.py');
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

  fastify.post('/upload', async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ message: 'No file uploaded' });
    }

    const ingestDir = path.join(process.cwd(), '..', '..', 'ingest');
    if (!fs.existsSync(ingestDir)) {
      fs.mkdirSync(ingestDir, { recursive: true });
    }

    const targetPath = path.join(ingestDir, data.filename);
    
    try {
      await pipeline(data.file, fs.createWriteStream(targetPath));
      return { 
        success: true, 
        message: `File ${data.filename} uploaded to ingest folder.`,
        filename: data.filename
      };
    } catch (err: any) {
      return reply.code(500).send({ 
        success: false, 
        message: 'Upload failed', 
        error: err.message 
      });
    }
  });
}
