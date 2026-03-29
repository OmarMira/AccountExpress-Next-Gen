import { rawDb } from '../src/db/connection.ts';
import { hashPassword } from '../src/services/auth/password.service.ts';

async function syncAdmin() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    console.error('ERROR: Missing ADMIN_USERNAME or ADMIN_PASSWORD');
    return;
  }

  const { hash, salt } = await hashPassword(password);
  
  const user = rawDb.query('SELECT id FROM users WHERE username = ?').get(username) as any;

  if (user) {
    console.log(`Updating existing user: ${username}`);
    rawDb.prepare(`
      UPDATE users 
      SET password_hash = ?, password_salt = ?, updated_at = ?, is_active = 1, is_locked = 0, failed_attempts = 0
      WHERE id = ?
    `).run(hash, salt, new Date().toISOString(), user.id);
    console.log('✅ Update successful');
  } else {
    console.log(`Creating new user: ${username}`);
    rawDb.prepare(`
      INSERT INTO users (id, username, email, password_hash, password_salt, first_name, last_name, is_super_admin, is_active, is_locked, failed_attempts, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 0, 0, ?, ?)
    `).run(crypto.randomUUID(), username, 'admin@accountexpress.local', hash, salt, 'Super', 'Admin', new Date().toISOString(), new Date().toISOString());
    console.log('✅ Creation successful');
  }
}

syncAdmin().catch(console.error);
