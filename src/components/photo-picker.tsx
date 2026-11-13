'use client';

import { Camera, ImagePlus, Loader2, X } from 'lucide-react';
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Button } from '@/components/ui/button';
import { MAX_PHOTO_BYTES, MAX_PHOTOS, PHOTO_MAX_DIMENSION } from '@/lib/photos';

export interface PickedPhoto {
  id: string;
  file: File;
  url: string;
}

/**
 * Re-encodes a photo as JPEG with its longest side at most PHOTO_MAX_DIMENSION, so a 4 MB phone photo
 * uploads as ~300 KB. Files the browser cannot decode (e.g. HEIC outside Safari) are sent unchanged and
 * the server decides.
 */
async function shrinkPhoto(file: File): Promise<File> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, PHOTO_MAX_DIMENSION / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.type === 'image/jpeg' && file.size <= 800 * 1024) {
      bmp.close();
      return file;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff'; // transparent PNGs would otherwise turn black in JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.82));
    if (!blob || (blob.size >= file.size && file.type === 'image/jpeg')) return file;
    return new File([blob], `${file.name.replace(/\.[^.]*$/, '') || 'photo'}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

export function PhotoPicker({
  photos,
  onChange,
  error,
  max = MAX_PHOTOS,
  hint = 'tile label, damage, the customer’s reference picture…',
}: {
  photos: PickedPhoto[];
  /** How many photos may be picked (fewer when adding to a case that already has some). */
  max?: number;
  hint?: string;
  /** A state setter: batches can finish out of order, so every change applies to the latest list. */
  onChange: Dispatch<SetStateAction<PickedPhoto[]>>;
  error?: string;
}) {
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Free the preview URLs when the form goes away.
  const latest = useRef(photos);
  latest.current = photos;
  useEffect(() => () => latest.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  const pending = useRef(0);

  async function add(list: FileList | null) {
    if (!list?.length) return;
    const chosen = [...list].slice(0, max);
    const leftOut = () => setNotice(`Only ${max} photo${max === 1 ? '' : 's'} can be added; extra photos were left out.`);
    if (list.length > max) leftOut();
    else setNotice(null);
    pending.current++;
    setBusy(true);
    try {
      const shrunk = await Promise.all(chosen.map(shrinkPhoto));
      const tooBig = shrunk.filter((f) => f.size > MAX_PHOTO_BYTES);
      if (tooBig.length) setNotice(`“${tooBig[0].name}” is too large (max ${MAX_PHOTO_BYTES / 1024 / 1024} MB) and was left out.`);
      const fits = shrunk.filter((f) => f.size <= MAX_PHOTO_BYTES);
      if (latest.current.length + fits.length > max) leftOut();
      const added = fits.map((file) => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file) }));
      onChange((current) => {
        // The cap is applied to the latest list, since another batch may have landed meanwhile.
        const room = Math.max(0, max - current.length);
        added.slice(room).forEach((p) => URL.revokeObjectURL(p.url));
        return [...current, ...added.slice(0, room)];
      });
    } finally {
      if (--pending.current === 0) setBusy(false);
      if (galleryRef.current) galleryRef.current.value = '';
      if (cameraRef.current) cameraRef.current.value = '';
    }
  }

  function remove(id: string) {
    const p = photos.find((x) => x.id === id);
    if (p) URL.revokeObjectURL(p.url);
    onChange((current) => current.filter((x) => x.id !== id));
  }

  const full = photos.length >= max;
  return (
    <div className="grid gap-3">
      {/* Not named: the form adds the shrunk files itself on submit. */}
      <input ref={galleryRef} type="file" accept="image/*" multiple hidden onChange={(e) => add(e.target.files)} data-testid="photo-input" />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => add(e.target.files)} />

      {photos.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6" aria-label="Attached photos">
          {photos.map((p, i) => (
            <li key={p.id} className="relative aspect-square overflow-hidden rounded-md border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
              <img src={p.url} alt={`Photo ${i + 1}`} className="size-full object-cover" />
              <button
                type="button"
                onClick={() => remove(p.id)}
                aria-label={`Remove photo ${i + 1}`}
                className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-background/90 shadow hover:bg-background"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => cameraRef.current?.click()} disabled={busy || full} className="sm:hidden">
          <Camera /> Take photo
        </Button>
        <Button type="button" variant="outline" onClick={() => galleryRef.current?.click()} disabled={busy || full}>
          {busy ? <Loader2 className="animate-spin" /> : <ImagePlus />}
          {busy ? 'Preparing…' : photos.length ? 'Add more photos' : 'Add photos'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {photos.length}/{max} photos · {hint}
      </p>
      {(error || notice) && <p className="text-sm text-destructive">{error ?? notice}</p>}
    </div>
  );
}
