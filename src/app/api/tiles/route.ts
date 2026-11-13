import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/dal';
import { searchSkuSheet } from '@/server/sku-sheet';

/** Item search for the report form, over the item sheet (Google Sheet), not the database. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const q = (request.nextUrl.searchParams.get('q') ?? '').slice(0, 100);
  try {
    const tiles = await searchSkuSheet(q);
    return NextResponse.json({ tiles }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('item search failed', e);
    return NextResponse.json({ error: 'The item list can’t be reached right now. Use “Tile not found” below.' }, { status: 503 });
  }
}
