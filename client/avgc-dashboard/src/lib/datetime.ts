export function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

export function shiftLabel(punchIn?: string | null, punchOut?: string | null): string {
  if (!punchIn) return 'Off shift — not clocked in';
  if (punchOut) return `Ended — completed ${formatDateTime(punchOut)}`;
  const start = new Date(punchIn);
  const mins = Math.floor((Date.now() - start.getTime()) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `Active — shift started ${h > 0 ? `${h}h ` : ''}${m}m ago`;
}
