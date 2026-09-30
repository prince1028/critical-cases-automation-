const TZ = 'Asia/Kolkata';

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: TZ }).format(new Date(d));
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: TZ,
  }).format(new Date(d));
}

/** "Just now", "5 minutes ago", "3 hours ago", then a date. */
export function formatRelative(d: Date | string, now = new Date()): string {
  const diff = (now.getTime() - new Date(d).getTime()) / 1000;
  if (diff < 60) return 'Just now';
  if (diff < 3600) {
    const m = Math.floor(diff / 60);
    return `${m} minute${m === 1 ? '' : 's'} ago`;
  }
  if (diff < 86400) {
    const h = Math.floor(diff / 3600);
    return `${h} hour${h === 1 ? '' : 's'} ago`;
  }
  return formatDateTime(d);
}

export function formatQuantity(n: string | number | null | undefined, unit?: string | null): string | null {
  if (n === null || n === undefined || n === '') return null;
  const v = Number(n);
  const text = Number.isInteger(v) ? v.toLocaleString('en-IN') : v.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  return unit ? `${text} ${unit}` : text;
}
