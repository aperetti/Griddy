import { FastifyInstance } from 'fastify';
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

  fastify.post('/upload', async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ message: 'No file uploaded' });
    }

    // Use INGEST_DIR from environment if available, otherwise fallback
    const ingestDir = process.env.INGEST_DIR || path.join(process.cwd(), '..', '..', 'ingest');
    if (!fs.existsSync(ingestDir)) {
      fs.mkdirSync(ingestDir, { recursive: true });
    }

    const safeFilename = path.basename(data.filename);
    const targetPath = path.join(ingestDir, safeFilename);
    
    try {
      await pipeline(data.file, fs.createWriteStream(targetPath));
      return { 
        success: true, 
        message: `File ${safeFilename} uploaded. The background ingestor service will process it shortly.`,
        filename: safeFilename
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
