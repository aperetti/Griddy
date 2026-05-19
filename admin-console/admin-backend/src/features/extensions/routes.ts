import { FastifyInstance } from 'fastify';
import path from 'path';
import fs from 'fs';
import { pipeline } from 'stream/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import multipart from '@fastify/multipart';

const execAsync = promisify(exec);
// ...
export async function extensionsRoutes(fastify: FastifyInstance) {
  // Register multipart support for this route group
  await fastify.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024 // 50MB limit
    }
  });

  // Ensure directories exist on startup
  try {
    if (!fs.existsSync(PLUGINS_TARGET)) fs.mkdirSync(PLUGINS_TARGET, { recursive: true });
    if (!fs.existsSync(ADAPTERS_TARGET)) fs.mkdirSync(ADAPTERS_TARGET, { recursive: true });
  } catch (err) {
    fastify.log.warn('Failed to create extension directories, might be read-only volume:', err);
  }

  fastify.post('/install', async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: 'No file uploaded' });
    }

    const typeField = (data.fields.type as any);
    const type = typeField?.value as string; // 'plugin' or 'adapter'
    
    if (type !== 'plugin' && type !== 'adapter') {
      return reply.status(400).send({ error: 'Invalid extension type. Must be "plugin" or "adapter".' });
    }

    const targetBase = type === 'plugin' ? PLUGINS_TARGET : ADAPTERS_TARGET;
    const tempPath = path.join('/tmp', data.filename);

    try {
      // 1. Save ZIP to temp
      await pipeline(data.file, fs.createWriteStream(tempPath));

      // 2. Extract ZIP
      // BusyBox unzip -o overwrites existing files.
      // We expect the ZIP to contain a directory (for plugins) or a .py file (for adapters).
      await execAsync(`unzip -o "${tempPath}" -d "${targetBase}"`);

      // 3. Cleanup
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }

      fastify.log.info(`Successfully installed ${type}: ${data.filename}`);
      return { 
        success: true, 
        message: `${type === 'plugin' ? 'Plugin' : 'AMI Adapter'} installed successfully.`,
        filename: data.filename 
      };
    } catch (err: any) {
      fastify.log.error(`Installation failed: ${err.message}`);
      return reply.status(500).send({ 
        error: 'Installation failed', 
        details: err.message 
      });
    }
  });
}
