/** Post-import verification queries against Neon. Read-only.  npm run db:verify */
import { sql } from 'drizzle-orm';
import { db, pool } from '../src/db';

const q = async (label: string, query: ReturnType<typeof sql>) => {
  const res = await db.execute(query);
  console.log(`\n--- ${label} ---`);
  console.table(res.rows);
  return res.rows;
};

await q('Totals', sql`
  SELECT (SELECT COUNT(*) FROM tiles) AS tiles,
         (SELECT COUNT(*) FROM critical_cases) AS cases,
         (SELECT COUNT(*) FROM critical_cases WHERE tile_id IS NULL) AS cases_without_tile,
         (SELECT COUNT(*) FROM critical_cases WHERE needs_review) AS needs_review,
         (SELECT COUNT(*) FROM case_events WHERE event_type = 'HISTORICAL_IMPORT') AS import_events,
         (SELECT COUNT(*) FROM critical_cases WHERE source = 'WHATSAPP_HISTORICAL' AND coalesce(source_messages,'') <> '') AS with_source_text`);

await q('Top problematic tiles', sql`
  SELECT t.tile_code, t.name, COUNT(c.id) AS critical_case_count
  FROM tiles t JOIN critical_cases c ON c.tile_id = t.id
  GROUP BY t.id, t.tile_code, t.name
  ORDER BY critical_case_count DESC, t.tile_code LIMIT 20`);

await q('Cases by issue (primary)', sql`
  SELECT issue_type, COUNT(*) AS count FROM critical_cases GROUP BY issue_type ORDER BY count DESC`);

await q('Cases by issue (all types, incl. secondary)', sql`
  SELECT it AS issue_type, COUNT(*) AS count
  FROM critical_cases, unnest(array_prepend(issue_type, coalesce(secondary_issue_types, '{}'))) it
  GROUP BY it ORDER BY count DESC`);

await q('Cases by status', sql`
  SELECT status, string_agg(DISTINCT original_status, ', ') AS from_original, COUNT(*) AS count
  FROM critical_cases GROUP BY status ORDER BY count DESC`);

await q('Review reasons', sql`
  SELECT r AS reason, COUNT(*) AS count FROM critical_cases, unnest(review_reasons) r GROUP BY r ORDER BY count DESC`);

await q('Duplicate import_hash check (expect 0 rows)', sql`
  SELECT import_hash, COUNT(*) FROM critical_cases WHERE import_hash IS NOT NULL GROUP BY import_hash HAVING COUNT(*) > 1`);

// The table is tiny, so the planner prefers a seq scan; disable it inside a transaction to prove the index is usable.
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('SET LOCAL enable_seqscan = off');
  const { rows: [t] } = await client.query('SELECT id FROM tiles LIMIT 1');
  const plan = await client.query('EXPLAIN SELECT * FROM critical_cases WHERE tile_id = $1', [t?.id ?? '00000000-0000-0000-0000-000000000000']);
  console.log('\n--- Plan for: SELECT * FROM critical_cases WHERE tile_id = ? ---');
  for (const row of plan.rows) console.log(row['QUERY PLAN']);
  await client.query('ROLLBACK');
} finally {
  client.release();
}
await pool.end();
