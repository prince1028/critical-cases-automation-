'use client';

import { Loader2, Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { postMessageAction, type MessageState } from './actions';

export interface CaseMessage {
  id: string;
  text: string;
  userId: string | null;
  userName: string | null;
  userTeam: string | null;
  createdAt: string;
  /** For notes written with a status change or the report, e.g. "Started working". */
  tag?: string;
}

/** New messages from the other side show up without a reload; checked while the tab is visible. */
const REFRESH_MS = 20_000;

export function CaseMessages({
  caseId,
  messages,
  meId,
  canPost,
  maxLength,
}: {
  caseId: string;
  messages: CaseMessage[];
  meId: string;
  canPost: boolean;
  maxLength: number;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<MessageState | undefined, FormData>(postMessageAction, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (state?.error) toast.error(state.error);
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  // Keep the newest message in view.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  useEffect(() => {
    if (!canPost) return;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, [canPost, router]);

  return (
    <div className="grid gap-4">
      {messages.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No messages yet.{canPost && ' Ask a question or give an update; the other side sees it here.'}
        </p>
      ) : (
        <ol ref={listRef} className="grid max-h-[28rem] gap-3 overflow-y-auto pr-1" aria-label="Messages">
          {messages.map((m) => {
            const mine = m.userId === meId;
            return (
              <li key={m.id} className={cn('flex flex-col gap-1', mine ? 'items-end' : 'items-start')}>
                <div className="flex flex-wrap items-baseline gap-x-2 px-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{mine ? 'You' : (m.userName ?? 'Someone')}</span>
                  {!mine && m.userTeam && <span>{m.userTeam}</span>}
                  <span>{formatDateTime(m.createdAt)}</span>
                </div>
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words',
                    mine ? 'rounded-tr-sm bg-primary text-primary-foreground' : 'rounded-tl-sm bg-muted',
                  )}
                >
                  {m.tag && <span className={cn('mb-0.5 block text-xs font-medium', mine ? 'opacity-80' : 'text-muted-foreground')}>{m.tag}</span>}
                  {m.text}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {canPost && (
        <form ref={formRef} action={action} className="grid gap-2">
          <input type="hidden" name="caseId" value={caseId} />
          <label htmlFor="case-message" className="sr-only">
            Message
          </label>
          <Textarea
            id="case-message"
            name="message"
            rows={2}
            maxLength={maxLength}
            placeholder="Write a message…"
            onKeyDown={(e) => {
              // Ctrl/Cmd+Enter sends; plain Enter is a new line (phones have no Ctrl).
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                formRef.current?.requestSubmit();
              }
            }}
          />
          <div className="flex items-center justify-between gap-2">
            <p className="hidden text-xs text-muted-foreground sm:block">Ctrl+Enter to send</p>
            <Button type="submit" disabled={pending} className="ml-auto">
              {pending ? <Loader2 className="animate-spin" /> : <Send />}
              Send
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
