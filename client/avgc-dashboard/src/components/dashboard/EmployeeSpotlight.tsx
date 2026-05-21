import { BadgeCheck } from 'lucide-react';
import type { EmployeeUser } from '@/types/employee';
import { cn } from '@/lib/cn';
import { formatTime, shiftLabel } from '@/lib/datetime';

type Props = {
  user: EmployeeUser | null;
  punchIn?: string | null;
  punchOut?: string | null;
};

export function EmployeeSpotlight({ user, punchIn, punchOut }: Props) {
  const shift = shiftLabel(punchIn, punchOut);
  const active = Boolean(punchIn && !punchOut);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:col-span-2 lg:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Employee spotlight
          </p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            {user?.name || 'Employee'}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {user?.employeecode ? `${user.employeecode} · ` : ''}
            Professional Staff
          </p>
          <p className="mt-2 text-sm font-medium text-slate-800">{user?.department || '—'}</p>
        </div>
        <div
          className={cn(
            'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold',
            active ? 'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200' : 'bg-slate-100 text-slate-700'
          )}
        >
          <BadgeCheck className="h-5 w-5 shrink-0" aria-hidden />
          <span className="max-w-[220px] leading-snug">Current shift · {shift}</span>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Last punch in</p>
          <p className="mt-1 text-sm font-bold text-slate-900">{formatTime(punchIn)}</p>
        </div>
        <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Last punch out</p>
          <p className="mt-1 text-sm font-bold text-slate-900">{formatTime(punchOut)}</p>
        </div>
      </div>
    </div>
  );
}
