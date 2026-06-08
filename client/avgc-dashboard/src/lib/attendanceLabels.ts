const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatLiveDate(d = new Date()): string {
  const day = String(d.getDate()).padStart(2, '0');
  const month = MONTHS_SHORT[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

export function monthName(m: number): string {
  return MONTHS_SHORT[Math.max(0, Math.min(11, m - 1))] || String(m);
}

/** Short label shown inside calendar day cells */
export function calendarDayAbbrev(status?: string | null): string {
  const s = String(status || '').toLowerCase();
  if (s === 'present') return 'P';
  if (s === 'halfday') return 'hd';
  if (s === 'absent') return 'A';
  if (s === 'leave') return 'L';
  return '';
}

export function formatAttendanceStatus(status?: string | null, _reason?: string | null): string {
  const s = String(status || '').toLowerCase();
  if (s === 'present') return 'Present';
  if (s === 'halfday') return 'Half Day';
  if (s === 'absent') return 'Absent';
  if (s === 'leave') return 'Leave';
  return status || '—';
}

export function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function formatWeekLabel(start: Date): string {
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${start.getDate()} ${MONTHS_SHORT[start.getMonth()]} – ${end.getDate()} ${MONTHS_SHORT[end.getMonth()]} ${end.getFullYear()}`;
}

export function weeksInMonth(month: number, year: number): { key: string; label: string }[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  const seen = new Map<string, string>();
  for (let day = 1; day <= daysInMonth; day += 1) {
    const d = new Date(year, month - 1, day);
    const mon = getMonday(d);
    const key = mon.toISOString().slice(0, 10);
    if (!seen.has(key)) seen.set(key, formatWeekLabel(mon));
  }
  return Array.from(seen.entries()).map(([key, label]) => ({ key, label }));
}

export { MONTHS_SHORT };
