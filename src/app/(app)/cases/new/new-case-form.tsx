'use client';

import { Loader2, Send } from 'lucide-react';
import { useActionState, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { SelectedTileCard, TileCombobox, type TileOption } from '@/components/tile-combobox';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ISSUE_TYPES, type IssueType } from '@/db/schema';
import { ISSUE_FIELDS } from '@/lib/case-fields';
import { ISSUE_LABELS, SEVERITIES, SEVERITY_LABELS, UNITS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { createCaseAction, type CreateCaseState } from './actions';

function FieldError({ id, errors }: { id: string; errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {errors[0]}
    </p>
  );
}

function StepTitle({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <CardTitle className="flex items-center gap-2 text-base">
      <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">{n}</span>
      {children}
    </CardTitle>
  );
}

export function NewCaseForm() {
  const [state, action, pending] = useActionState<CreateCaseState | undefined, FormData>(createCaseAction, undefined);
  const v = state?.values ?? {};
  const fe = state?.fieldErrors ?? {};

  const [tile, setTile] = useState<TileOption | null>(null);
  const [noTile, setNoTile] = useState(v.noTile === 'on');
  const [issue, setIssue] = useState<IssueType | ''>((v.issueType as IssueType) ?? '');

  useEffect(() => {
    if (state?.error) toast.error(state.error);
  }, [state]);

  const cfg = issue ? ISSUE_FIELDS[issue] : null;
  const req = (f: string) => cfg?.required.includes(f as never);

  return (
    <form action={action} className="grid gap-4" noValidate>
      {/* Step 1: tile */}
      <Card>
        <CardHeader>
          <StepTitle n={1}>Tile</StepTitle>
          <CardDescription>Search by tile code, name, brand, colour, size or finish.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <input type="hidden" name="tileId" value={tile && !noTile ? tile.id : ''} />
          {!noTile && (
            <>
              <TileCombobox value={tile} onChange={setTile} invalid={!!fe.tileId} />
              {tile && <SelectedTileCard tile={tile} onClear={() => setTile(null)} />}
            </>
          )}
          <label className="flex cursor-pointer items-start gap-2 rounded-md border border-dashed px-3 py-2.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
            <input
              type="checkbox"
              name="noTile"
              checked={noTile}
              onChange={(e) => {
                setNoTile(e.target.checked);
                if (e.target.checked) setTile(null);
              }}
              className="mt-0.5 size-4 accent-(--primary)"
            />
            <span>
              <span className="font-medium">Tile not found / I don’t know the tile number</span>
              <span className="block text-xs text-muted-foreground">The case is saved without a tile. No tile record is created.</span>
            </span>
          </label>
          {noTile && (
            <div className="grid gap-2">
              <Label htmlFor="requestedTileName">Tile name or details (optional)</Label>
              <Input
                id="requestedTileName"
                name="requestedTileName"
                defaultValue={v.requestedTileName}
                placeholder="e.g. Crystal Black 2x2, or 'grey stone look from MyTyles'"
              />
            </div>
          )}
          <FieldError id="tileId-error" errors={fe.tileId} />
        </CardContent>
      </Card>

      {/* Step 2: problem */}
      <Card>
        <CardHeader>
          <StepTitle n={2}>Problem</StepTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          <input type="hidden" name="issueType" value={issue} />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Problem">
            {ISSUE_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={issue === t}
                onClick={() => setIssue(t)}
                className={cn(
                  'rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-accent',
                  issue === t && 'border-primary bg-primary/10 font-medium text-foreground',
                )}
              >
                {ISSUE_LABELS[t]}
              </button>
            ))}
          </div>
          <FieldError id="issueType-error" errors={fe.issueType} />
        </CardContent>
      </Card>

      {/* Step 3: details */}
      {cfg && (
        <Card>
          <CardHeader>
            <StepTitle n={3}>Details</StepTitle>
            <CardDescription>Only the fields marked * are required.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="description">Customer requirement / description *</Label>
              <Textarea
                id="description"
                name="description"
                rows={3}
                defaultValue={v.description}
                placeholder={cfg.descriptionHint}
                aria-invalid={!!fe.description}
                aria-describedby="description-error"
              />
              <FieldError id="description-error" errors={fe.description} />
            </div>

            {cfg.show.includes('requestedColor') && (
              <div className="grid gap-2">
                <Label htmlFor="requestedColor">Requested colour{req('requestedColor') && ' *'}</Label>
                <Input id="requestedColor" name="requestedColor" defaultValue={v.requestedColor} aria-invalid={!!fe.requestedColor} />
                <FieldError id="requestedColor-error" errors={fe.requestedColor} />
              </div>
            )}
            {cfg.show.includes('requestedSize') && (
              <div className="grid gap-2">
                <Label htmlFor="requestedSize">Requested size{req('requestedSize') && ' *'}</Label>
                <Input id="requestedSize" name="requestedSize" placeholder="e.g. 600x1200" defaultValue={v.requestedSize} aria-invalid={!!fe.requestedSize} />
                <FieldError id="requestedSize-error" errors={fe.requestedSize} />
              </div>
            )}
            {cfg.show.includes('requestedFinish') && (
              <div className="grid gap-2">
                <Label htmlFor="requestedFinish">Requested finish{req('requestedFinish') && ' *'}</Label>
                <Input id="requestedFinish" name="requestedFinish" placeholder="e.g. Matt, Glossy, Carving" defaultValue={v.requestedFinish} aria-invalid={!!fe.requestedFinish} />
                <FieldError id="requestedFinish-error" errors={fe.requestedFinish} />
              </div>
            )}

            {cfg.show.includes('quantities') && (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="requiredQuantity">Required qty{req('requiredQuantity') && ' *'}</Label>
                  <Input id="requiredQuantity" name="requiredQuantity" inputMode="decimal" defaultValue={v.requiredQuantity} aria-invalid={!!fe.requiredQuantity} />
                  <FieldError id="requiredQuantity-error" errors={fe.requiredQuantity} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="availableQuantity">Available qty{req('availableQuantity') && ' *'}</Label>
                  <Input id="availableQuantity" name="availableQuantity" inputMode="decimal" defaultValue={v.availableQuantity} aria-invalid={!!fe.availableQuantity} />
                  <FieldError id="availableQuantity-error" errors={fe.availableQuantity} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="unit">Unit{req('unit') && ' *'}</Label>
                  <Select name="unit" defaultValue={v.unit || undefined}>
                    <SelectTrigger id="unit" className="w-full" aria-invalid={!!fe.unit}>
                      <SelectValue placeholder="Choose" />
                    </SelectTrigger>
                    <SelectContent>
                      {UNITS.map((u) => (
                        <SelectItem key={u} value={u}>
                          {u}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError id="unit-error" errors={fe.unit} />
                </div>
              </div>
            )}

            {cfg.show.includes('alternative') && (
              <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
                <div className="grid gap-2">
                  <Label htmlFor="alternativeTileText">Alternative offered</Label>
                  <Input id="alternativeTileText" name="alternativeTileText" placeholder="Tile code or name" defaultValue={v.alternativeTileText} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="alternativeAccepted">Customer accepted it?</Label>
                  <Select name="alternativeAccepted" defaultValue={v.alternativeAccepted || undefined}>
                    <SelectTrigger id="alternativeAccepted" className="w-full">
                      <SelectValue placeholder="Not yet known" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Yes</SelectItem>
                      <SelectItem value="no">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
              <div className="grid gap-2">
                <Label htmlFor="severity">Severity</Label>
                <Select name="severity" defaultValue={v.severity || undefined}>
                  <SelectTrigger id="severity" className="w-full">
                    <SelectValue placeholder="Not set" />
                  </SelectTrigger>
                  <SelectContent>
                    {SEVERITIES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {SEVERITY_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="notes">Additional notes</Label>
                <Input id="notes" name="notes" defaultValue={v.notes} placeholder="Anything else the team should know" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {state?.error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <div className="sticky bottom-0 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={pending || !issue}>
          {pending ? <Loader2 className="animate-spin" /> : <Send />}
          {pending ? 'Submitting…' : 'Submit Case'}
        </Button>
        {!issue && <p className="mt-2 text-xs text-muted-foreground">Choose the problem to continue.</p>}
      </div>
    </form>
  );
}
