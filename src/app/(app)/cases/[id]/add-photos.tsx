'use client';

import { Loader2, Upload } from 'lucide-react';
import { useActionState, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PhotoPicker, type PickedPhoto } from '@/components/photo-picker';
import { Button } from '@/components/ui/button';
import { addPhotosAction, type AddPhotosState } from './actions';

/** Adds photos to a case that's already reported. `max` is how many the case can still take. */
export function AddPhotos({ caseId, max }: { caseId: string; max: number }) {
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [state, action, pending] = useActionState<AddPhotosState | undefined, FormData>(addPhotosAction, undefined);

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success(state.message ?? 'Photos added');
      setPhotos((current) => {
        current.forEach((p) => URL.revokeObjectURL(p.url));
        return [];
      });
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  const submit = (fd: FormData) => {
    for (const p of photos) fd.append('photos', p.file);
    return action(fd);
  };

  return (
    <form action={submit} className="grid gap-3">
      <input type="hidden" name="caseId" value={caseId} />
      <PhotoPicker photos={photos} onChange={setPhotos} max={max} hint="e.g. the delivered tiles, a new reference, proof of the fix" error={state?.error} />
      {photos.length > 0 && (
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Upload />}
            {pending ? 'Uploading…' : `Upload ${photos.length} photo${photos.length === 1 ? '' : 's'}`}
          </Button>
        </div>
      )}
    </form>
  );
}
