import { FastifyRequest, FastifyReply } from 'fastify';
import { getAdminDb } from './database.js';
import crypto from 'crypto';
import util from 'util';

const pbkdf2Async = util.promisify(crypto.pbkdf2);

export async function adminAuthHook(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return reply.status(401).send({ error: 'Not authenticated' });
  }

  const base64Credentials = authHeader.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
  const colonIndex = credentials.indexOf(':');

  if (colonIndex === -1) {
    return reply.status(401).send({ error: 'Incorrect username or password' });
  }

  const username = credentials.substring(0, colonIndex);
  const password = credentials.substring(colonIndex + 1);

  if (!username || !password) {
    return reply.status(401).send({ error: 'Incorrect username or password' });
  }

  const db = await getAdminDb();
  const user = await db.get('SELECT username, password_hash, salt FROM users WHERE username = ?', [username]);

  // Dummy salt and hash if user not found to prevent timing attacks on username enumeration
  const dummySalt = Buffer.alloc(16).fill(0).toString('hex');
  const dummyHash = Buffer.alloc(32).fill(0).toString('hex');

  const saltToUse = user ? user.salt : dummySalt;
  const hashToUse = user ? user.password_hash : dummyHash;

  const saltBytes = Buffer.from(saltToUse, 'hex');
  const derivedKey = await pbkdf2Async(password, saltBytes, 100000, 32, 'sha256');
  const inboundHashHex = derivedKey.toString('hex');

  const buf1 = Buffer.from(inboundHashHex, 'hex');
  const buf2 = Buffer.from(hashToUse, 'hex');

  let isPasswordCorrect = false;
  if (buf1.length === buf2.length) {
    isPasswordCorrect = crypto.timingSafeEqual(buf1, buf2);
  }

  const isUserValid = !!user;

  if (!isUserValid || !isPasswordCorrect) {
    return reply.status(401).send({ error: 'Incorrect username or password' });
  }
}
