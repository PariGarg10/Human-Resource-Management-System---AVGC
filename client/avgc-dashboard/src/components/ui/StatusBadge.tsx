import { cn } from '@/lib/cn';

const styles: Record<string, string> = {
  present: 'bg-emerald-100 text-emerald-900',
  halfday: 'bg-amber-100 text-amber-900',
  absent: 'bg-red-100 text-red-900',
  leave: 'bg-blue-100 text-blue-900',
  holiday: 'bg-violet-100 text-violet-900',
  pending: 'bg-orange-100 text-orange-900',
  approved: 'bg-emerald-100 text-emerald-900',
  rejected: 'bg-red-100 text-red-900',
  cancelled: 'bg-slate-200 text-slate-700',
  open: 'bg-blue-100 text-blue-900',
  responded: 'bg-emerald-100 text-emerald-900',
  closed: 'bg-slate-200 text-slate-700',
};

export function StatusBadge({ status }: { status?: string }) {
  const raw = (status || 'absent').toLowerCase().replace(/\s+/g, '');
  const cls = styles[raw] || styles.absent;
  const label = status || 'absent';
  const pretty =
    raw === 'present'
      ? 'Present'
      : raw === 'halfday'
        ? 'Half Day'
        : String(label).replace(/^\w/, (c) => c.toUpperCase());
  return (
    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-semibold', cls)}>
      {pretty}
    </span>
  );
}
