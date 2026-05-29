import http from 'http';
import app from './app';
import { pool } from './db/client';

const PORT = parseInt(process.env.PORT ?? '3001', 10);

async function start(): Promise<void> {
  // Verify DB connection
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('Database connection established');
  } catch (err) {
    console.error('Failed to connect to database:', err);
    process.exit(1);
  }

  const server = http.createServer(app);

  server.listen(PORT, () => {
    console.log(`DataSync Field API listening on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV ?? 'development'}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`${signal} received. Shutting down gracefully...`);
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start();
