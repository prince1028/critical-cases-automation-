'use client';

import { CheckCircle2, Loader2, TriangleAlert, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { reviewReasonLabel } from '@/lib/constants';
import { importWhatsAppAction, type ImportState } from './actions';

const n = (v: number) => v.toLocaleString('en-IN');

/** Upload control plus the import summary. The page stays a thin shell around this. */
export function ImportForm() {
  const [state, setState] = useState<ImportState>();
  const [pending, setPending] = useState(false);
  const [fileName, setFileName] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const submit = async (formData: FormData) => {
    setPending(true);
    try {
      setState(await importWhatsAppAction(undefined, formData));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="grid gap-4">
      <form action={submit} className="grid gap-3">
        <label
          className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed bg-card p-6 text-center transition-colors hover:border-primary/50"
          htmlFor="wa-file"
        >
          <Upload className="size-6 text-muted-foreground" aria-hidden />
          <span className="text-sm font-medium">{fileName || 'Choose the exported .txt file'}</span>
          <span className="text-xs text-muted-foreground">
            WhatsApp group → Export chat → “Without media”. Up to 8 MB.
          </span>
          <input
            ref={input}
            id="wa-file"
            name="file"
            type="file"
            accept=".txt,text/plain"
            required
            className="sr-only"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={pending || !fileName}>
            {pending ? <Loader2 className="animate-spin" /> : <Upload />} Import
          </Button>
          {pending && <span className="text-sm text-muted-foreground">Parsing and importing…</span>}
        </div>
      </form>

      {state?.error && (
        <p className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      )}

      {state?.summary && <ImportSummary summary={state.summary} />}
    </div>
  );
}

function ImportSummary({ summary: s }: { summary: NonNullable<ImportState['summary']> }) {
  const reasons = Object.entries(s.reviewReasons).sort((a, b) => b[1] - a[1]);
  return (
    <div className="grid gap-3 rounded-xl border bg-card p-4">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />
        WhatsApp import complete — {s.fileName}
      </p>
      {s.dateRange && (
        <p className="text-xs text-muted-foreground">
          Messages dated {s.dateRange.from} to {s.dateRange.to}
          {s.unparsedLines > 0 && ` · ${n(s.unparsedLines)} unreadable lines skipped`}
          {s.systemLines > 0 && ` · ${n(s.systemLines)} system notices skipped`}
        </p>
      )}
      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        <Row label="Messages processed" value={s.messagesProcessed} />
        <Row label="Critical-case messages" value={s.caseMessages} />
        <Row label="New cases" value={s.newCases} strong />
        <Row label="Duplicates skipped" value={s.duplicatesSkipped} />
        <Row label="Needs review" value={s.needsReview} />
        <Row label="Errors" value={s.errors.length} />
        <Row label="Messages ignored (chatter)" value={s.skippedMessages} />
        <Row label="Tiles created" value={s.tilesCreated} />
      </dl>
      <p className="text-xs text-muted-foreground">
        Only new messages are inserted; nothing already in the database is changed. Uploading the same file again adds
        nothing — every message is keyed by its date, time, sender and text.
      </p>

      {reasons.length > 0 && (
        <div className="grid gap-1.5 border-t pt-3">
          <p className="text-xs font-medium">Flagged for review</p>
          <ul className="flex flex-wrap gap-1.5">
            {reasons.map(([reason, count]) => (
              <li key={reason} className="rounded-md bg-muted px-2 py-0.5 text-xs">
                {reviewReasonLabel(reason)} · {count}
              </li>
            ))}
          </ul>
        </div>
      )}

      {s.errors.length > 0 && (
        <div className="grid gap-1.5 border-t pt-3">
          <p className="text-xs font-medium">Not imported</p>
          <ul className="grid gap-1 text-xs text-muted-foreground">
            {s.errors.slice(0, 10).map((e, i) => (
              <li key={i}>
                line {e.line}: {e.reason} — “{e.message}”
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="rounded-lg border px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={strong ? 'text-xl font-semibold tabular-nums' : 'text-lg font-medium tabular-nums'}>{n(value)}</dd>
    </div>
  );
}