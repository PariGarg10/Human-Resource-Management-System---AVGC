export const BUSINESS_TZ = 'Asia/Kolkata';

const TIME_OPTS: Intl.DateTimeFormatOptions = {
  timeZone: BUSINESS_TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
};

const DATETIME_OPTS: Intl.DateTimeFormatOptions = {
  timeZone: BUSINESS_TZ,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
};

export function formatHours(value?: number | string | null): string {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  if (Number.isNaN(num)) return '—';
  return num.toFixed(2);
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', DATETIME_OPTS);
}

export function formatTime(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-IN', TIME_OPTS);
}

export function shiftLabel(punchIn?: string | null, punchOut?: string | null): string {
  if (!punchIn) return 'Off shift — not clocked in';
  if (punchOut) return `Ended — completed ${formatDateTime(punchOut)}`;
  const start = new Date(punchIn);
  const mins = Math.floor((Date.now() - start.getTime()) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `Currently checked in since ${formatTime(punchIn)} (${h > 0 ? `${h}h ` : ''}${m}m ago)`;
}
