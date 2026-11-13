/**
 * Rules for photos attached to a case. Shared by the form (to warn early) and the server (which enforces them).
 * The browser shrinks photos before upload (see shrinkPhoto in the form), so real uploads are a few hundred KB.
 */
export const MAX_PHOTOS = 6;
/** Photos a case can hold in total: the ones sent with the report plus any added later. */
export const MAX_CASE_PHOTOS = 12;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
/** Longest side after the browser shrinks a photo. Enough to read a tile label or see a crack. */
export const PHOTO_MAX_DIMENSION = 1600;

export type PhotoType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic';

export const PHOTO_EXTENSIONS: Record<PhotoType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

/** Image type from the file's first bytes. The browser's claimed type and the file name are never trusted. */
export function sniffPhotoType(b: Uint8Array): PhotoType | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b[0] === 0x89 && ascii(1, 4) === 'PNG' && b[4] === 0x0d && b[5] === 0x0a) return 'image/png';
  if (b.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  // iPhone photos: ISO-BMFF "ftyp" box with a HEIF brand.
  if (b.length >= 12 && ascii(4, 8) === 'ftyp' && ['heic', 'heix', 'hevc', 'mif1', 'msf1'].includes(ascii(8, 12))) return 'image/heic';
  return null;
}

export interface PhotoCheck {
  name: string;
  size: number;
  bytes: Uint8Array;
}

/**
 * First problem with the photo list, as a message for the salesperson, or null when all are fine.
 * `onCase` is how many photos the case already has (0 for a new case).
 */
export function photoProblem(photos: PhotoCheck[], onCase = 0): string | null {
  if (photos.length > MAX_PHOTOS) return `Attach up to ${MAX_PHOTOS} photos at a time.`;
  if (onCase + photos.length > MAX_CASE_PHOTOS) {
    const left = Math.max(0, MAX_CASE_PHOTOS - onCase);
    return left ? `This case can take ${left} more photo${left === 1 ? '' : 's'} (${MAX_CASE_PHOTOS} at most).` : `This case already has ${MAX_CASE_PHOTOS} photos, the most it can hold.`;
  }
  for (const p of photos) {
    const label = p.name ? `“${p.name}”` : 'A photo';
    if (p.size > MAX_PHOTO_BYTES) return `${label} is too large (max ${MAX_PHOTO_BYTES / 1024 / 1024} MB).`;
    if (!sniffPhotoType(p.bytes)) return `${label} is not a photo. Use JPG, PNG, WebP or HEIC.`;
  }
  return null;
}

/** Storage key for a new photo, e.g. cases/2026/10/<uuid>.jpg. `prefix` keeps test uploads apart. */
export function photoObjectKey(id: string, type: PhotoType, now = new Date(), prefix = '') {
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${prefix}cases/${now.getUTCFullYear()}/${month}/${id}.${PHOTO_EXTENSIONS[type]}`;
}

/** Display name, kept short and free of path parts and control characters. */
export function cleanFileName(name: string): string | null {
  const base = name.split(/[\\/]/).pop()?.replace(/[\x00-\x1f\x7f"]/g, '').trim() ?? '';
  return base ? base.slice(0, 200) : null;
}
