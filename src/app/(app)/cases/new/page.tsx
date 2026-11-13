import type { Metadata } from 'next';
import { requireUser } from '@/lib/dal';
import { skuFieldOptions } from '@/server/sku-sheet';
import { NewCaseForm, type TileFieldOptions } from './new-case-form';

export const metadata: Metadata = { title: 'Report Case' };

export default async function NewCasePage() {
  await requireUser();
  // Suggestions for colour/size/finish/body; the form still works (free text) if the sheet can't be read.
  const options: TileFieldOptions = await skuFieldOptions().catch((e) => {
    console.error('item sheet unavailable for form suggestions', e);
    return { size: [], finish: [], body: [], color: [] };
  });
  return (
    <div className="mx-auto grid max-w-2xl gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Report Critical Case</h1>
        <p className="text-sm text-muted-foreground">Tile → problem → details → submit. Takes under a minute.</p>
      </div>
      <NewCaseForm options={options} />
    </div>
  );
}
