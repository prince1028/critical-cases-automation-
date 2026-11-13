import 'server-only';
import { randomUUID } from 'node:crypto';
import { cleanFileName, photoObjectKey, photoProblem, sniffPhotoType } from '@/lib/photos';
import type { StoredPhoto } from './cases';
import { deleteObjects, putObject, storageConfigured, storagePrefix } from './storage';

export type PhotoUpload = { ok: true; stored: StoredPhoto[] } | { ok: false; error: string };

/**
 * Checks the "photos" files of a form and uploads them to storage. The caller then records `stored` in the
 * database, and must call discardPhotos(stored) if that fails, so storage never keeps orphans.
 * `onCase` is how many photos the case already has.
 */
export async function uploadFormPhotos(formData: FormData, onCase = 0): Promise<PhotoUpload> {
  const files = formData.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0);
  const photos = await Promise.all(files.map(async (f) => ({ name: f.name, size: f.size, bytes: new Uint8Array(await f.arrayBuffer()) })));
  const problem = photoProblem(photos, onCase);
  if (problem) return { ok: false, error: problem };
  if (photos.length && !storageConfigured()) return { ok: false, error: 'Photo uploads are not set up yet.' };

  const stored: StoredPhoto[] = photos.map((p) => {
    const type = sniffPhotoType(p.bytes)!;
    return { objectKey: photoObjectKey(randomUUID(), type, new Date(), storagePrefix()), contentType: type, sizeBytes: p.size, fileName: cleanFileName(p.name) };
  });
  try {
    await Promise.all(stored.map((s, i) => putObject(s.objectKey, photos[i].bytes, s.contentType)));
  } catch (e) {
    console.error('photo upload failed', e);
    await discardPhotos(stored);
    return { ok: false, error: 'The photos could not be uploaded. Check your connection and try again; nothing was saved.' };
  }
  return { ok: true, stored };
}

export const discardPhotos = (stored: StoredPhoto[]) => deleteObjects(stored.map((s) => s.objectKey));
