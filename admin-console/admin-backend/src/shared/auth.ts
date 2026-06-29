import { FastifyRequest, FastifyReply } from 'fastify';
import { getAdminDb } from './database.js';
import crypto from 'crypto';
import util from 'util';

const pbkdf2Async = util.promisify(crypto.pbkdf2);

export async function adminAuthHook(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return reply.code(401).send({ error: 'Unauthorized: Missing or invalid Authorization header' });
  }

  const base64Credentials = authHeader.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');

  // Handle case where password might contain colons
  const colonIndex = credentials.indexOf(':');
  if (colonIndex === -1) {
    return reply.code(401).send({ error: 'Unauthorized: Invalid credentials format' });
  }

  const username = credentials.substring(0, colonIndex);
  const password = credentials.substring(colonIndex + 1);

  const db = await getAdminDb();
  const user = await db.get('SELECT password_hash, salt FROM users WHERE username = ?', username);

  if (!user) {
    // Return early if user does not exist
    return reply.code(401).send({ error: 'Unauthorized: Invalid credentials' });
  }

  const saltBuffer = Buffer.from(user.salt, 'hex');
  const derivedKey = await pbkdf2Async(password, saltBuffer, 100000, 32, 'sha256');

  const providedHashBuffer = derivedKey;
  const expectedHashBuffer = Buffer.from(user.password_hash, 'hex');

  // Ensure buffers are the same length before timingSafeEqual to prevent TypeError
  if (providedHashBuffer.length !== expectedHashBuffer.length) {
    return reply.code(401).send({ error: 'Unauthorized: Invalid credentials' });
  }

  if (!crypto.timingSafeEqual(providedHashBuffer, expectedHashBuffer)) {
    return reply.code(401).send({ error: 'Unauthorized: Invalid credentials' });
  }
}
