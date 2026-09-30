import 'server-only';
import { asc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { tiles } from '@/db/schema';

export interface TileOption {
  id: string;
  tileCode: string;
  name: string | null;
  brand: string | null;
  color: string | null;
  size: string | null;
  finish: string | null;
  supplier: string | null;
  currentStock: string | null;
}

const columns = {
  id: tiles.id,
  tileCode: tiles.tileCode,
  name: tiles.name,
  brand: tiles.brand,
  color: tiles.color,
  size: tiles.size,
  finish: tiles.finish,
  supplier: tiles.supplier,
  currentStock: tiles.currentStock,
};

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Active tiles matching the query on code, name, brand, colour, size, finish or supplier. Codes are shown exactly as stored. */
export async function searchTiles(query: string, limit = 20): Promise<TileOption[]> {
  const q = query.trim();
  const base = db.select(columns).from(tiles).$dynamic();
  if (!q) {
    return base.where(eq(tiles.active, true)).orderBy(asc(tiles.tileCode)).limit(limit);
  }
  const pattern = `%${escapeLike(q)}%`;
  return base
    .where(
      sql`${tiles.active} = true AND ${or(
        ilike(tiles.tileCode, pattern),
        ilike(tiles.name, pattern),
        ilike(tiles.brand, pattern),
        ilike(tiles.color, pattern),
        ilike(tiles.size, pattern),
        ilike(tiles.finish, pattern),
        ilike(tiles.supplier, pattern),
      )}`,
    )
    // Exact / prefix code matches first.
    .orderBy(
      sql`CASE WHEN ${tiles.tileCode} ILIKE ${escapeLike(q)} THEN 0 WHEN ${tiles.tileCode} ILIKE ${`${escapeLike(q)}%`} THEN 1 ELSE 2 END`,
      asc(tiles.tileCode),
    )
    .limit(limit);
}

export async function getTileById(id: string): Promise<TileOption | null> {
  const [t] = await db.select(columns).from(tiles).where(eq(tiles.id, id)).limit(1);
  return t ?? null;
}
