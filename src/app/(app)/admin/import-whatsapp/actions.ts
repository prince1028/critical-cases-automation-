'use server';

import { revalidatePath } from 'next/cache';
import { requireAnalyticsViewer } from '@/lib/dal';
import { ANALYTICS_ROUTE } from '@/lib/mvp';
import { importWhatsAppExport, type ImportSummary } from '@/server/whatsapp-import';
import { invalidateTtl } from '@/server/ttl-memo';

export interface ImportState {
  ok: boolean;
  summary?: ImportSummary;
  error?: string;
}

/**
 * Ingests one WhatsApp "Export chat" .txt file.
 *
 * Safe to run repeatedly: cases are keyed by a deterministic hash of the message (date + time +
 * sender + text), so re-uploading the same export, or one that overlaps history already imported,
 * adds nothing. Nothing is ever updated or deleted.
 *
 * TEMPORARY (Analytics MVP): requireAnalyticsViewer lets this run while the auth bypass is on, so
 * the import works without a session. That also means the write is reachable without one - turn the
 * bypass off (ANALYTICS_MVP_BYPASS_AUTH=false) before this is exposed to anyone else.
 */
export async function importWhatsAppAction(_prev: ImportState | undefined, formData: FormData): Promise<ImportState> {
  await requireAnalyticsViewer();
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'Choose the exported .txt file first.' };
  if (!file.name.toLowerCase().endsWith('.txt') && file.type !== 'text/plain') {
    return { ok: false, error: 'That does not look like a WhatsApp export. Upload the .txt from "Export chat".' };
  }

  try {
    const summary = await importWhatsAppExport(file);
    // The dashboard reads the same rows, so it only has to be re-rendered, not recalculated. The
    // in-isolate memo has to be dropped too, or a fresh import stays invisible for up to a minute.
    invalidateTtl();
    revalidatePath(ANALYTICS_ROUTE);
    revalidatePath('/admin/analytics');
    return { ok: true, summary };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('whatsapp import failed', message);
    return { ok: false, error: message };
  }
}