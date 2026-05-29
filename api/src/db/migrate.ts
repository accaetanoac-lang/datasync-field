import fs from 'fs';
import path from 'path';
import { pool } from './client';
import dotenv from 'dotenv';

dotenv.config();

async function runMigrations(): Promise<void> {
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(200) UNIQUE NOT NULL,
        run_at TIMESTAMP DEFAULT NOW()
      )
    `);

    for (const file of files) {
      const already = await client.query(
        'SELECT id FROM _migrations WHERE filename = $1',
        [file]
      );
      if (already.rows.length > 0) {
        console.log(`Migration already applied: ${file}`);
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`Applied migration: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    console.log('All migrations complete.');
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
