/** 1st/3rd/5th Saturday working; 2nd/4th off (common alternate pattern). */
export function defaultSaturdayStatus(dateStr: string): 'working' | 'off' {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || '').trim());
  if (!m) return 'working';
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const dayOfMonth = Number(m[3]);
  let saturdayIndex = 0;
  for (let d = 1; d <= dayOfMonth; d += 1) {
    if (new Date(y, mo - 1, d).getDay() === 6) saturdayIndex += 1;
  }
  return saturdayIndex % 2 === 0 ? 'off' : 'working';
}

export function resolveSaturdayStatus(
  dateStr: string,
  storedStatus?: 'working' | 'off' | null
): 'working' | 'off' {
  const defaultStatus = defaultSaturdayStatus(dateStr);
  if (!storedStatus) return defaultStatus;
  // Legacy rows marked every Saturday off; keep explicit working overrides on default-off days.
  if (storedStatus === 'off' && defaultStatus === 'working') return defaultStatus;
  return storedStatus;
}
