import { FastifyRequest, FastifyReply } from 'fastify';
import { getAdminDb } from './database.js';
import crypto from 'crypto';
import util from 'util';

const pbkdf2Async = util.promisify(crypto.pbkdf2);

export async function adminAuthHook(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return reply.status(401).header('WWW-Authenticate', 'Basic realm="Admin Console"').send({ error: 'Authentication required' });
  }

  const b64auth = authHeader.split(' ')[1];
  const credentials = Buffer.from(b64auth, 'base64').toString('utf8');

  const colonIdx = credentials.indexOf(':');
  if (colonIdx === -1) {
    return reply.status(401).send({ error: 'Invalid credentials format' });
  }

  const username = credentials.substring(0, colonIdx);
  const password = credentials.substring(colonIdx + 1);

  const db = await getAdminDb();
  const user = await db.get('SELECT password_hash, salt FROM users WHERE username = ?', [username]);

  if (!user) {
    return reply.status(401).send({ error: 'Invalid username or password' });
  }

  const saltBuffer = Buffer.from(user.salt, 'hex');
  const derivedKey = await pbkdf2Async(password, saltBuffer, 100000, 32, 'sha256');
  const derivedHex = derivedKey.toString('hex');

  const storedHashBuffer = Buffer.from(user.password_hash, 'hex');
  const derivedHashBuffer = Buffer.from(derivedHex, 'hex');

  if (storedHashBuffer.length !== derivedHashBuffer.length) {
    return reply.status(401).send({ error: 'Invalid username or password' });
  }

  if (!crypto.timingSafeEqual(storedHashBuffer, derivedHashBuffer)) {
    return reply.status(401).send({ error: 'Invalid username or password' });
  }
}
