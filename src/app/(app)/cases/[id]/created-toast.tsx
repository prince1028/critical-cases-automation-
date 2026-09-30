'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

/** Shows the success toast once after a case is submitted, then removes ?created=1 from the URL. */
export function CreatedToast({ caseCode }: { caseCode: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const shown = useRef(false);
  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    toast.dismiss(); // clear any validation-error toasts from earlier attempts
    toast.success(`Case ${caseCode ?? ''} reported`, { description: 'Saved. The team can now see it.' });
    router.replace(pathname, { scroll: false });
  }, [caseCode, pathname, router]);
  return null;
}
