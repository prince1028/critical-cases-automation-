import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/dal';
import { searchTiles } from '@/server/tiles';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const q = (request.nextUrl.searchParams.get('q') ?? '').slice(0, 100);
  try {
    const tiles = await searchTiles(q);
    return NextResponse.json({ tiles }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('tile search failed', e);
    return NextResponse.json({ error: 'Tile search is unavailable right now' }, { status: 503 });
  }
}
