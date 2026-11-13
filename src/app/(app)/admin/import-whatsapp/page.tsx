import { ArrowLeft, MessageCircleMore, ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAnalyticsViewer } from '@/lib/dal';
import { formatDateTime } from '@/lib/format';
import { ANALYTICS_ROUTE } from '@/lib/mvp';
import { recentTxtImports } from '@/server/whatsapp-import';
import { ImportForm } from './import-form';

export const metadata: Metadata = { title: 'Import WhatsApp Data' };

/**
 * The ingestion layer of the analytics MVP: WhatsApp → Export chat → .txt → parser → dedup → Neon → analytics.
 * A secondary page, deliberately not a primary navigation item: the dashboard is the product.
 */
export default async function ImportWhatsAppPage() {
  await requireAnalyticsViewer();
  const imports = await recentTxtImports().catch(() => []);

  return (
    <div className="mx-auto grid max-w-3xl gap-5">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
          <Link href={ANALYTICS_ROUTE}>
            <ArrowLeft /> Back to Analytics
          </Link>
        </Button>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <MessageCircleMore className="size-6" aria-hidden /> Import WhatsApp Data
        </h1>
        <p className="text-sm text-muted-foreground">
          Critical cases are still reported in the WhatsApp group. Export the chat and upload the .txt here; new cases
          land in the database and the analytics recalculate on their real dates.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload an export</CardTitle>
          <CardDescription>
            In WhatsApp: open the group → menu → <span className="font-medium">Export chat</span> →{' '}
            <span className="font-medium">Without media</span>. Upload the .txt it saves.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ImportForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4" aria-hidden /> Safe to run again
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm text-muted-foreground">
          <p>
            The chat is exported every couple of weeks, so exports overlap. Each case is keyed by a deterministic hash
            of the message itself — date, time, sender and text — never by a row number or the upload time. Uploading
            the same file twice creates nothing the second time.
          </p>
          <p>
            Imported rows are marked <span className="font-medium text-foreground">WhatsApp history</span> and keep the
            exact message in the case. Existing rows are never edited or deleted by an import.
          </p>
        </CardContent>
      </Card>

      {imports.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent imports</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1.5 text-sm">
              {imports.map((i, idx) => (
                <li key={idx} className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-1.5 last:border-0">
                  <span className="min-w-0 truncate">{i.file ?? 'whatsapp export'}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(i.importedAt)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}