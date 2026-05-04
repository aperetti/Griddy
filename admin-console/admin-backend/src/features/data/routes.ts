import { FastifyInstance } from 'fastify';
import { runCommand } from '../../shared/shell.js';
import path from 'path';
import fs from 'fs';
import { pipeline } from 'stream/promises';
import multipart from '@fastify/multipart';

/**
 * Resolves the Python executable path based on the environment.
 */
function resolvePythonPath(): string {
  // Check for virtualenv in dev (Windows/Linux)
  const winVenv = path.join(process.cwd(), '..', '..', '.venv', 'Scripts', 'python.exe');
  const nixVenv = path.join(process.cwd(), '..', '..', '.venv', 'bin', 'python');
  
  if (fs.existsSync(winVenv)) return winVenv;
  if (fs.existsSync(nixVenv)) return nixVenv;
  
  // Default to system python in Docker/Production
  return 'python3';
}

export async function dataRoutes(fastify: FastifyInstance) {
  // Register multipart support for this route group
  await fastify.register(multipart, {
    limits: {
      fileSize: 100 * 1024 * 1024 // 100MB limit
    }
  });

  fastify.post('/generate', async (request, reply) => {
    const pythonPath = resolvePythonPath();
    const scriptPath = path.join(process.cwd(), '..', '..', 'backend', 'scripts', 'generate_all.py');
    
    // Secure: arguments passed as array
    const result = await runCommand(pythonPath, [scriptPath]);
    return { 
      success: result.stderr === '', 
      output: result.stdout, 
      error: result.stderr 
    };
  });

  fastify.post('/ingest', async (request, reply) => {
    const pythonPath = resolvePythonPath();
    const scriptPath = path.join(process.cwd(), '..', '..', 'backend', 'scripts', 'ingest_cim_to_neo4j.py');
    const ingestDir = path.join(process.cwd(), '..', '..', 'ingest');
    
    // Secure: arguments passed as array
    const result = await runCommand(pythonPath, [scriptPath, ingestDir]);
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

    const safeFilename = path.basename(data.filename);
    const targetPath = path.join(ingestDir, safeFilename);
    
    try {
      await pipeline(data.file, fs.createWriteStream(targetPath));
      return { 
        success: true, 
        message: `File ${safeFilename} uploaded to ingest folder.`,
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
