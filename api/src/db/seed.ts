import bcrypt from 'bcryptjs';
import { pool } from './client';
import dotenv from 'dotenv';

dotenv.config();

async function seed(): Promise<void> {
  const hash = await bcrypt.hash('admin123', 10);
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO technicians (name, email, role, active, password_hash)
       VALUES ('Admin', 'admin@northgreen.com.br', 'admin', TRUE, $1)
       ON CONFLICT (email) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             name          = EXCLUDED.name,
             role          = EXCLUDED.role,
             active        = EXCLUDED.active`,
      [hash]
    );
    console.log('Admin account seeded: admin@northgreen.com.br');
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
