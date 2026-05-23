import { FastifyInstance } from 'fastify';
import path from 'path';
import fs from 'fs';
import { pipeline } from 'stream/promises';
import { runCommand } from '../../shared/shell.js';
import multipart from '@fastify/multipart';

const CONFIG_DIR = '/data/config';
const PLUGINS_TARGET = path.join(CONFIG_DIR, 'plugins');
const ADAPTERS_TARGET = path.join(CONFIG_DIR, 'adapters');
const SAFE_EXTRACT_SCRIPT = '/app/scripts/safe_extract.py';

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
    fastify.log.warn({ err }, 'Failed to create extension directories, might be read-only volume');
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

      // 2. Extract ZIP Safely using Python helper
      // This script validates paths (prevents ZIP Slip) and whitelists file extensions.
      // We assume python3 is available in the admin-backend image.
      const { stdout, stderr } = await runCommand('python3', [
        SAFE_EXTRACT_SCRIPT,
        tempPath,
        targetBase,
        type
      ]);

      if (stdout.includes('ERROR:')) {
        throw new Error(stdout.split('ERROR:')[1].trim());
      }

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
