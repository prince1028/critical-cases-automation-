import type { Metadata } from 'next';
import { requireUser } from '@/lib/dal';
import { NewCaseForm } from './new-case-form';

export const metadata: Metadata = { title: 'Report Case' };

export default async function NewCasePage() {
  await requireUser();
  return (
    <div className="mx-auto grid max-w-2xl gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Report Critical Case</h1>
        <p className="text-sm text-muted-foreground">Tile → problem → details → submit. Takes under a minute.</p>
      </div>
      <NewCaseForm />
    </div>
  );
}
