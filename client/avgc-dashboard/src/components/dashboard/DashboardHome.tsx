import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { EmployeeUser } from '@/types/employee';
import type { NavId } from '@/components/layout/Sidebar';
import { LeadershipMessage } from '@/components/dashboard/LeadershipMessage';
import { EmployeeSpotlight } from '@/components/dashboard/EmployeeSpotlight';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { ProductivityChart } from '@/components/dashboard/ProductivityChart';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatTime } from '@/lib/datetime';

type TodayRes = {
  record: {
    punchin?: string | null;
    punchout?: string | null;
    status?: string;
    holidayName?: string;
    holidayType?: string;
  } | null;
};

type SummaryRes = {
  present: number;
  halfday: number;
  absent: number;
  leave?: number;
  holidays?: number;
};

type LeaveBalanceItem = {
  type: string;
  total: number;
  used: number;
  remaining: number;
};

type LeaveBalanceRes = {
  year: number;
  balances: LeaveBalanceItem[];
  totals: {
    total: number;
    used: number;
    remaining: number;
  };
};

type Props = {
  user: EmployeeUser | null;
  onNavigate: (id: NavId) => void;
  onPasswordRequired: (msg?: string) => void;
};

type BirthdayPerson = { id: number; name: string };
type HolidayRow = { id: number; holidayName: string; date: string; type: string };

function holidayTypeLabel(type: string) {
  if (type === 'national') return 'National Holiday';
  if (type === 'festival') return 'Festival';
  if (type === 'optional') return 'Optional';
  return type || 'Holiday';
}

function holidayTone(type: string) {
  if (type === 'national') return 'border-blue-100 bg-blue-50 text-blue-950';
  if (type === 'festival') return 'border-violet-100 bg-violet-50 text-violet-950';
  return 'border-slate-200 bg-slate-50 text-slate-900';
}

export function DashboardHome({ user, onNavigate, onPasswordRequired }: Props) {
  const [today, setToday] = useState<TodayRes | null>(null);
  const [summary, setSummary] = useState<SummaryRes | null>(null);
  const [leaveBalance, setLeaveBalance] = useState<LeaveBalanceRes | null>(null);
  const [birthdaysToday, setBirthdaysToday] = useState<BirthdayPerson[]>([]);
  const [holidays, setHolidays] = useState<HolidayRow[]>([]);
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
      if (user?.id) {
        const balance = await api<LeaveBalanceRes>(`/api/leave-balance/${user.id}`).catch(() => null);
        setLeaveBalance(balance);
      }
      const n = await api<{ birthdaysToday?: BirthdayPerson[] }>('/api/notifications').catch(() => ({
        birthdaysToday: [] as BirthdayPerson[],
      }));
      setBirthdaysToday(n.birthdaysToday || []);
      const holidayData = await api<{ holidays?: HolidayRow[] }>(`/api/holidays?month=${month}&year=${year}`).catch(() => ({
        holidays: [] as HolidayRow[],
      }));
      setHolidays(holidayData.holidays || []);
    } catch (e) {
      if (e instanceof ApiError && e.requiresPasswordChange) {
        onPasswordRequired(e.message);
        return;
      }
      toast(e instanceof Error ? e.message : 'Could not load dashboard', 'error');
    } finally {
      setLoading(false);
    }
  }, [onPasswordRequired, user?.id]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const record = today?.record;
  const punchIn = record?.punchin ?? null;
  const punchOut = record?.punchout ?? null;
  const checkedIn = Boolean(punchIn && !punchOut);

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

  const birthdayLine =
    birthdaysToday.length > 0
      ? birthdaysToday.map((b) => b.name || 'Colleague').join(', ')
      : '';

  return (
    <div className="space-y-6">
      {birthdayLine && (
        <div
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950 shadow-sm"
          role="status"
        >
          🎂 Birthdays Today: {birthdayLine}
        </div>
      )}

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
          {record?.status?.toLowerCase() === 'holiday' && record.holidayName && (
            <p className="mt-1 text-sm font-medium text-violet-800">{record.holidayName}</p>
          )}
          <p className="mt-2 text-sm text-slate-600">
            {record?.status?.toLowerCase() === 'holiday'
              ? 'Organisation holiday — leave is not counted against this day.'
              : checkedIn
                ? `Currently checked in since ${formatTime(punchIn)}.`
                : punchIn || punchOut
                  ? `Last punch in: ${formatTime(punchIn)} · Last punch out: ${formatTime(punchOut)}`
                : 'No punch recorded yet today.'}
          </p>
        </div>

        <QuickActions
          onClock={() => onNavigate('punch')}
          onLeave={() => onNavigate('leave-apply')}
          onTeam={() =>
            toast('Team coverage and assignments are visible to your manager in the manager workspace.', 'info')
          }
        />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:col-span-4 lg:grid-cols-5">
          {[
            { label: 'Full days', value: summary?.present ?? '—', tone: 'text-emerald-700' },
            { label: 'Half days', value: summary?.halfday ?? '—', tone: 'text-amber-700' },
            { label: 'Leave days', value: summary?.leave ?? '—', tone: 'text-blue-700' },
            { label: 'Absent days', value: summary?.absent ?? '—', tone: 'text-red-700' },
            { label: 'Holidays', value: summary?.holidays ?? '—', tone: 'text-violet-700' },
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

        <LeaveBalanceWidget balance={leaveBalance} />

        <HolidayWidget holidays={holidays} />

        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 lg:col-span-2">
          <h3 className="text-sm font-semibold text-slate-800">Enterprise HRMS snapshot</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            This hub uses your organisation&apos;s AVGC theme (Bebas Neue + DM Sans). Figures refresh from live
            attendance APIs when you are online.
          </p>
        </div>
      </div>

      <div className="mt-8 -mx-4 overflow-hidden rounded-none md:-mx-6 lg:-mx-8">
        <LeadershipMessage />
      </div>
    </div>
  );
}

function HolidayWidget({ holidays }: { holidays: HolidayRow[] }) {
  const upcoming = holidays
    .filter((holiday) => holiday.date >= new Date().toISOString().slice(0, 10))
    .slice(0, 5);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Holidays this month</p>
      <div className="mt-4 space-y-3">
        {upcoming.length === 0 ? (
          <p className="text-sm text-slate-500">No upcoming holidays this month.</p>
        ) : (
          upcoming.map((holiday) => (
            <div
              key={`${holiday.id}-${holiday.date}`}
              className={`rounded-lg border px-3 py-2 ${holidayTone(holiday.type)}`}
            >
              <p className="text-sm font-semibold">{holiday.holidayName}</p>
              <p className="mt-0.5 text-xs font-medium uppercase tracking-wide opacity-80">
                {holiday.date} · {holidayTypeLabel(holiday.type)}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function LeaveBalanceWidget({ balance }: { balance: LeaveBalanceRes | null }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Leave balance</p>
          <h3 className="mt-1 text-lg font-bold text-slate-900">{balance?.year ?? new Date().getFullYear()}</h3>
        </div>
        <div className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-800">
          {balance ? `${balance.totals.remaining}/${balance.totals.total} left` : 'Loading'}
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {(balance?.balances || []).map((item) => {
          const pct = item.total > 0 ? Math.min(100, Math.round((item.used / item.total) * 100)) : 0;
          return (
            <div key={item.type}>
              <div className="flex justify-between text-xs font-medium text-slate-600">
                <span>{item.type}</span>
                <span>
                  {item.used} used · {item.remaining} remaining
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-avgc-brand" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
        {!balance && <p className="text-sm text-slate-500">Balance will appear after the dashboard finishes loading.</p>}
      </div>
    </div>
  );
}
