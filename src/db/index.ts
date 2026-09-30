import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set (see .env.example)');

// Reuse one pool across hot reloads in development.
const globalForDb = globalThis as unknown as { __florzyPool?: pg.Pool };

export const pool =
  globalForDb.__florzyPool ??
  new pg.Pool({ connectionString, max: 5, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 30_000 });
if (process.env.NODE_ENV !== 'production') globalForDb.__florzyPool = pool;

// Neon closes idle connections when the compute scales to zero. pg reports that as an 'error' on the
// idle client; without a listener Node would crash the whole server. The pool replaces the client itself.
if (!pool.listenerCount('error')) {
  pool.on('error', (err) => console.warn('Postgres idle client error (pool will reconnect):', err.message));
}

export const db = drizzle(pool, { schema });
export { schema };
