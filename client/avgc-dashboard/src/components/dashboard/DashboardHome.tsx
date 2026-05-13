import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { EmployeeUser } from '@/types/employee';
import { EmployeeSpotlight } from '@/components/dashboard/EmployeeSpotlight';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { ProductivityChart } from '@/components/dashboard/ProductivityChart';
import { StatusBadge } from '@/components/ui/StatusBadge';

type TodayRes = {
  record: {
    punchin?: string | null;
    punchout?: string | null;
    status?: string;
  } | null;
};

type SummaryRes = {
  present: number;
  halfday: number;
  absent: number;
  leave?: number;
};

type Props = {
  user: EmployeeUser | null;
  onNavigate: (id: 'attendance' | 'leave-apply') => void;
  onPasswordRequired: (msg?: string) => void;
};

export function DashboardHome({ user, onNavigate, onPasswordRequired }: Props) {
  const [today, setToday] = useState<TodayRes | null>(null);
  const [summary, setSummary] = useState<SummaryRes | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    try {
      const [t, s] = await Promise.all([
        api<TodayRes>('/api/attendance/today'),
        api<SummaryRes>(`/api/attendance/summary?month=${month}&year=${year}`),
      ]);
      setToday(t);
      setSummary(s);
    } catch (e) {
      if (e instanceof ApiError && e.requiresPasswordChange) {
        onPasswordRequired(e.message);
        return;
      }
      toast(e instanceof Error ? e.message : 'Could not load dashboard', 'error');
    } finally {
      setLoading(false);
    }
  }, [onPasswordRequired]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const record = today?.record;
  const punchIn = record?.punchin ?? null;
  const punchOut = record?.punchout ?? null;

  const productivityHint =
    summary != null
      ? Math.min(
          100,
          Math.round(
            ((summary.present + (summary.halfday || 0) * 0.5) /
              Math.max(1, summary.present + summary.halfday + summary.absent + (summary.leave || 0))) *
              100
          )
        )
      : undefined;

  return (
    <div className="space-y-6">
      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
          Loading dashboard…
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-6">
        <EmployeeSpotlight user={user} punchIn={punchIn} punchOut={punchOut} />

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Today</p>
          <p className="mt-3 text-3xl font-bold text-slate-900">
            <StatusBadge status={record?.status} />
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {record?.punchin ? 'You have activity logged for today.' : 'No punch recorded yet today.'}
          </p>
        </div>

        <QuickActions
          onClock={() => {
            toast('Open My Attendance for punch details. Biometric punches sync from your device.', 'info');
            onNavigate('attendance');
          }}
          onLeave={() => onNavigate('leave-apply')}
          onTeam={() =>
            toast('Team roster view is powered by manager analytics — demo shows Buzz presence.', 'info')
          }
        />

        <div className="grid grid-cols-2 gap-3 lg:col-span-4 lg:grid-cols-4">
          {[
            { label: 'Present days', value: summary?.present ?? '—', tone: 'text-emerald-700' },
            { label: 'Half days', value: summary?.halfday ?? '—', tone: 'text-amber-700' },
            { label: 'Leave days', value: summary?.leave ?? '—', tone: 'text-blue-700' },
            { label: 'Absent days', value: summary?.absent ?? '—', tone: 'text-red-700' },
          ].map((row) => (
            <div
              key={row.label}
              className="rounded-xl border border-slate-100 bg-slate-50/80 p-4 shadow-sm"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{row.label}</p>
              <p className={`mt-2 text-2xl font-bold ${row.tone}`}>{row.value}</p>
            </div>
          ))}
        </div>

        <ProductivityChart productivityHint={productivityHint} />

        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 lg:col-span-2">
          <h3 className="text-sm font-semibold text-slate-800">Enterprise HRMS snapshot</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            This dashboard uses a modular bento layout with navy (#1A237E) accents, aligned to AVGC branding.
            Data refreshes from your live attendance APIs when available.
          </p>
        </div>
      </div>
    </div>
  );
}
