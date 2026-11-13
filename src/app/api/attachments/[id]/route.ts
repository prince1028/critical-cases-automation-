import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/dal';
import { getPhotoForUser } from '@/server/cases';
import { getObject } from '@/server/storage';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Sends a case photo from the private bucket to someone allowed to see the case. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { id } = await params;
  const notFound = () => NextResponse.json({ error: 'Photo not found' }, { status: 404 });
  if (!UUID.test(id)) return notFound();

  try {
    const photo = await getPhotoForUser(id, user);
    if (!photo) return notFound();
    const obj = await getObject(photo.objectKey);
    if (!obj) return notFound();
    // Photos are a few hundred KB, so read them whole: a viewer leaving mid-download then can't break a stream.
    const bytes = await obj.arrayBuffer();

    const name = (photo.fileName ?? 'photo').replace(/[^\w.\- ]/g, '_');
    return new Response(bytes, {
      headers: {
        'Content-Type': photo.contentType,
        'Content-Length': String(bytes.byteLength),
        'Content-Disposition': `inline; filename="${name}"`,
        // Photos never change once uploaded; private so shared caches never keep them.
        'Cache-Control': 'private, max-age=86400, immutable',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      },
    });
  } catch (e) {
    console.error(`photo ${id} failed`, e);
    return NextResponse.json({ error: 'Photos are unavailable right now' }, { status: 503 });
  }
}
