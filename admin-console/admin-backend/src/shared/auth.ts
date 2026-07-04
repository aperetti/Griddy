import { FastifyRequest, FastifyReply } from 'fastify';
import { getAdminDb } from './database.js';
import crypto from 'crypto';
import util from 'util';

const pbkdf2Async = util.promisify(crypto.pbkdf2);

export async function adminAuthHook(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return reply.status(401).send({ error: 'Unauthorized: Missing or invalid Authorization header' });
  }

  const base64Credentials = authHeader.substring(6);
  const credentials = Buffer.from(base64Credentials, 'base64').toString('utf8');

  // Handling usernames that might contain a colon is edge case, split on first colon
  const colonIndex = credentials.indexOf(':');
  if (colonIndex === -1) {
    return reply.status(401).send({ error: 'Unauthorized: Invalid credentials format' });
  }

  const username = credentials.substring(0, colonIndex);
  const password = credentials.substring(colonIndex + 1);

  if (!username || !password) {
    return reply.status(401).send({ error: 'Unauthorized: Invalid credentials format' });
  }

  const db = await getAdminDb();
  const user = await db.get('SELECT id, password_hash, salt FROM users WHERE username = ?', username);

  if (!user) {
    return reply.status(401).send({ error: 'Unauthorized: Invalid credentials' });
  }

  try {
    const saltBuffer = Buffer.from(user.salt, 'hex');
    const derivedKey = await pbkdf2Async(password, saltBuffer, 100000, 32, 'sha256');
    const providedHashBuffer = derivedKey;
    const storedHashBuffer = Buffer.from(user.password_hash, 'hex');

    if (providedHashBuffer.length !== storedHashBuffer.length || !crypto.timingSafeEqual(providedHashBuffer, storedHashBuffer)) {
      return reply.status(401).send({ error: 'Unauthorized: Invalid credentials' });
    }
  } catch (err) {
    request.log.error({ err }, 'Error during password verification');
    return reply.status(500).send({ error: 'Internal server error' });
  }
}
