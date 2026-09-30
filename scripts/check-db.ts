import { sql } from 'drizzle-orm';
import { db, pool } from '../src/db';

// Connection check: never prints DATABASE_URL.
const res = await db.execute<{ now: string; db: string; role: string; version: string }>(
  sql`SELECT NOW() AS now, current_database() AS db, current_user AS role, split_part(version(), ' ', 2) AS version`,
);
const r = res.rows[0];
console.log(`Connected to Neon | database: ${r.db} | role: ${r.role} | Postgres ${r.version} | NOW(): ${r.now}`);
await pool.end();
