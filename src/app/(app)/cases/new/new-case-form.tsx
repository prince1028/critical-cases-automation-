'use client';

import { Check, Loader2, Send } from 'lucide-react';
import { useActionState, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PhotoPicker, type PickedPhoto } from '@/components/photo-picker';
import { SelectedTileCard, TileCombobox, type TileOption } from '@/components/tile-combobox';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ISSUE_TYPES, type IssueType } from '@/db/schema';
import { MAX_ISSUES, mergeIssueFields } from '@/lib/case-fields';
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

export interface TileFieldOptions {
  size: string[];
  finish: string[];
  body: string[];
  color: string[];
}

type Details = { tileColor: string; tileSize: string; tileFinish: string; tileBody: string };

/** A required text field with suggestions from the item sheet (free text still allowed). */
function DetailInput({
  id,
  label,
  value,
  onChange,
  options,
  placeholder,
  errors,
  filled,
}: {
  id: keyof Details;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
  errors?: string[];
  filled: boolean;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>
        {label} *{filled && <span className="ml-1 text-xs font-normal text-muted-foreground">(from the item sheet)</span>}
      </Label>
      <Input
        id={id}
        name={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        list={options.length ? `${id}-options` : undefined}
        placeholder={placeholder}
        autoComplete="off"
        aria-invalid={!!errors?.length}
        aria-describedby={`${id}-error`}
      />
      {options.length > 0 && (
        <datalist id={`${id}-options`}>
          {options.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      )}
      <FieldError id={`${id}-error`} errors={errors} />
    </div>
  );
}

export function NewCaseForm({ options }: { options: TileFieldOptions }) {
  const [state, action, pending] = useActionState<CreateCaseState | undefined, FormData>(createCaseAction, undefined);
  const v = state?.values ?? {};
  const fe = state?.fieldErrors ?? {};

  const [tile, setTileState] = useState<TileOption | null>(null);
  const [details, setDetails] = useState<Details>({
    tileColor: v.tileColor ?? '',
    tileSize: v.tileSize ?? '',
    tileFinish: v.tileFinish ?? '',
    tileBody: v.tileBody ?? '',
  });
  const setDetail = (k: keyof Details) => (val: string) => setDetails((d) => ({ ...d, [k]: val }));
  // Picking an item fills its size, finish and body (and colour, if the sheet has one); all stay editable.
  const setTile = (t: TileOption | null) => {
    setTileState(t);
    if (t) {
      setDetails((d) => ({
        tileColor: t.color ?? d.tileColor,
        tileSize: t.size ?? '',
        tileFinish: t.finish ?? '',
        tileBody: t.body ?? '',
      }));
    }
  };
  const [noTile, setNoTile] = useState(v.noTile === 'on');
  // In the order picked: the first one is the main problem.
  const [issues, setIssues] = useState<IssueType[]>(() => (v.issueTypes ? (v.issueTypes.split(',') as IssueType[]) : []));
  const toggleIssue = (t: IssueType) =>
    setIssues((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : cur.length < MAX_ISSUES ? [...cur, t] : cur));
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);

  // The picked (already shrunk) photos live in state, not in a file input, so they survive a failed submit.
  const submit = (fd: FormData) => {
    fd.delete('photos');
    for (const p of photos) fd.append('photos', p.file);
    return action(fd);
  };

  useEffect(() => {
    if (state?.error) toast.error(state.error);
  }, [state]);

  const cfg = mergeIssueFields(issues);
  const req = (f: string) => cfg?.required.includes(f as never);

  return (
    <form action={submit} className="grid gap-4" noValidate>
      {/* Step 1: tile */}
      <Card>
        <CardHeader>
          <StepTitle n={1}>Tile</StepTitle>
          <CardDescription>Search the item list by Florzy code or SKU name.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <input type="hidden" name="skuCode" value={tile && !noTile ? tile.code : ''} />
          {!noTile && (
            <>
              <TileCombobox value={tile} onChange={setTile} invalid={!!fe.skuCode} />
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
              <span className="block text-xs text-muted-foreground">The Listing team is alerted to add it to the item list.</span>
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
          <FieldError id="skuCode-error" errors={fe.skuCode} />

          {(tile || noTile) && (
            <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
              <DetailInput id="tileColor" label="Colour" value={details.tileColor} onChange={setDetail('tileColor')}
                options={options.color} placeholder="e.g. Beige, Grey, Statuario white" errors={fe.tileColor} filled={!!tile?.color} />
              <DetailInput id="tileSize" label="Size" value={details.tileSize} onChange={setDetail('tileSize')}
                options={options.size} placeholder="e.g. 600x1200mm" errors={fe.tileSize} filled={!!tile?.size} />
              <DetailInput id="tileFinish" label="Finish" value={details.tileFinish} onChange={setDetail('tileFinish')}
                options={options.finish} placeholder="e.g. Matt, Glossy" errors={fe.tileFinish} filled={!!tile?.finish} />
              <DetailInput id="tileBody" label="Body" value={details.tileBody} onChange={setDetail('tileBody')}
                options={options.body} placeholder="e.g. Vitrified, Ceramic" errors={fe.tileBody} filled={!!tile?.body} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2: problem */}
      <Card>
        <CardHeader>
          <StepTitle n={2}>Problem</StepTitle>
          <CardDescription>Tick every problem that applies (up to {MAX_ISSUES}). The first one you tick is the main one.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {issues.map((t) => (
            <input key={t} type="hidden" name="issueTypes" value={t} />
          ))}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label="Problem">
            {ISSUE_TYPES.map((t) => {
              const on = issues.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggleIssue(t)}
                  className={cn(
                    'flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-accent',
                    on && 'border-primary bg-primary/10 font-medium text-foreground',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'flex size-4 shrink-0 items-center justify-center rounded-sm border',
                      on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40',
                    )}
                  >
                    {on && <Check className="size-3" />}
                  </span>
                  {ISSUE_LABELS[t]}
                </button>
              );
            })}
          </div>
          <FieldError id="issueTypes-error" errors={fe.issueTypes} />
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

      {cfg && (
        <Card>
          <CardHeader>
            <StepTitle n={4}>Photos</StepTitle>
            <CardDescription>Optional. Up to 6 photos; they are shown on the case and sent to the Supply team.</CardDescription>
          </CardHeader>
          <CardContent>
            <PhotoPicker photos={photos} onChange={setPhotos} error={fe.photos?.[0]} />
          </CardContent>
        </Card>
      )}

      {state?.error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
        <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={pending || issues.length === 0}>
          {pending ? <Loader2 className="animate-spin" /> : <Send />}
          {pending ? 'Submitting…' : 'Submit Case'}
        </Button>
        {issues.length === 0 && <p className="mt-2 text-xs text-muted-foreground">Choose the problem to continue.</p>}
      </div>
    </form>
  );
}
