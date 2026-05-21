import { FastifyInstance } from 'fastify';
import { getAdminDb } from '../../shared/database.js';
import crypto from 'crypto';
import util from 'util';

export async function usersRoutes(fastify: FastifyInstance) {
  // List all users
  fastify.get('/', async () => {
    const db = await getAdminDb();
    return db.all('SELECT id, username, created_at FROM users');
  });

  // Create or Update a user's password
  fastify.post('/', async (request, reply) => {
    const { username, password } = request.body as { username?: string, password?: string };
    if (!username || !password) {
      return reply.code(400).send({ error: "Username and password are required" });
    }

    const db = await getAdminDb();
    // Replicate Python's: os.urandom(16)
    const salt = crypto.randomBytes(16);
    // Replicate Python's: hashlib.pbkdf2_hmac('sha256', pwd, salt, 100000).hex()
    const pbkdf2Async = util.promisify(crypto.pbkdf2);
    const derivedKey = await pbkdf2Async(password, salt, 100000, 32, 'sha256');
    const passwordHash = derivedKey.toString('hex');

    const existing = await db.get('SELECT id FROM users WHERE username = ?', username);
    if (existing) {
      await db.run(
        'UPDATE users SET password_hash = ?, salt = ? WHERE username = ?',
        [passwordHash, salt.toString('hex'), username]
      );
    } else {
      await db.run(
        'INSERT INTO users (username, password_hash, salt) VALUES (?, ?, ?)',
        [username, passwordHash, salt.toString('hex')]
      );
    }
    return { success: true };
  });

  // Delete a user
  fastify.delete('/:username', async (request, reply) => {
    const { username } = request.params as { username: string };
    const db = await getAdminDb();
    
    // Prevent deleting the very last user to avoid accidental lockouts
    const countRow = await db.get('SELECT COUNT(*) as count FROM users');
    if (countRow && countRow.count <= 1) {
      return reply.code(400).send({ error: "Cannot delete the last remaining user." });
    }

    await db.run('DELETE FROM users WHERE username = ?', username);
    return { success: true };
  });
}
