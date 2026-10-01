import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { cache } from 'react';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set (see .env.example)');

type Db = ReturnType<typeof drizzle<typeof schema, pg.Pool>>;

function createPool(opts: pg.PoolConfig) {
  const p = new pg.Pool({ connectionString, connectionTimeoutMillis: 10_000, ...opts });
  // Neon closes idle connections when the compute scales to zero. pg reports that as an 'error' on the
  // idle client; without a listener Node would crash the whole server. The pool replaces the client itself.
  p.on('error', (err) => console.warn('Postgres idle client error (pool will reconnect):', err.message));
  return p;
}

/**
 * Cloudflare Workers cannot reuse a socket opened by one request in another, so there each request
 * gets its own pool whose connections close after a single use. Node (dev, tests, scripts) keeps one
 * long-lived pool, reused across hot reloads in development.
 */
const onWorkers = typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';

const globalForDb = globalThis as unknown as { __florzyPool?: pg.Pool };

/** Node only (the maintenance scripts use it directly); undefined on Workers. */
export const pool = (
  onWorkers ? undefined : (globalForDb.__florzyPool ??= createPool({ max: 5, idleTimeoutMillis: 30_000 }))
) as pg.Pool;

const requestDb = cache((): Db => drizzle(createPool({ max: 5, maxUses: 1 }), { schema }));
const nodeDb: Db | undefined = pool ? drizzle(pool, { schema }) : undefined;

export const db: Db =
  nodeDb ??
  new Proxy({} as Db, {
    get(_, prop) {
      const inst = requestDb();
      const v = Reflect.get(inst, prop, inst);
      return typeof v === 'function' ? v.bind(inst) : v;
    },
  });
export { schema };
