/**
 * Frame for the signed-out pages (login, sign-up, password): an orange brand panel (a band on phones,
 * a side panel on larger screens) next to the form.
 */
export function AuthShell({ title = 'Florzy', subtitle = 'Critical Case Management', children }: { title?: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh bg-muted/40 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section className="relative overflow-hidden bg-primary px-6 pt-[calc(2.5rem+env(safe-area-inset-top))] pb-16 text-primary-foreground lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="relative z-10 mx-auto flex max-w-sm flex-col items-center text-center lg:mx-0 lg:items-start lg:text-left">
          <img src="/florzy-logo.png" alt="Florzy" width={56} height={56} className="mb-4 size-14 rounded-2xl shadow-lg ring-4 ring-white/20" />
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-primary-foreground/85">{subtitle}</p>
        </div>
        <p className="relative z-10 hidden max-w-sm text-lg leading-relaxed text-primary-foreground/90 lg:block">
          Out of stock, wrong shade, damaged boxes: report it in under a minute, and the Supply team picks it up straight away.
        </p>
        <span aria-hidden className="pointer-events-none absolute -right-24 -bottom-24 size-80 rounded-full bg-white/10" />
        <span aria-hidden className="pointer-events-none absolute -top-16 -left-16 size-56 rounded-full bg-white/5" />
      </section>
      <div className="-mt-10 flex justify-center px-4 pb-10 lg:mt-0 lg:items-center lg:py-10">
        <div className="relative z-10 w-full max-w-sm">{children}</div>
      </div>
    </main>
  );
}
