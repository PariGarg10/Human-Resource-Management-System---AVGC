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

type TaskRow = {
  id: string;
  done: boolean;
};

type TasksRes = {
  tasks: TaskRow[];
};

type OrgDirectoryRes = {
  sections: Array<{ id: string; label: string; people: unknown[] }>;
  total: number;
};

type NotificationRow = {
  id: number;
  message: string;
  type: string;
  isRead: boolean;
  createdAt?: string;
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
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [taskSummary, setTaskSummary] = useState({ open: 0, done: 0 });
  const [orgSummary, setOrgSummary] = useState<{ total: number; sections: string[] }>({ total: 0, sections: [] });
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
      const n = await api<{ birthdaysToday?: BirthdayPerson[]; notifications?: NotificationRow[] }>('/api/notifications').catch(() => ({
        birthdaysToday: [] as BirthdayPerson[],
        notifications: [] as NotificationRow[],
      }));
      setBirthdaysToday(n.birthdaysToday || []);
      setNotifications(n.notifications || []);
      const taskData = await api<TasksRes>('/api/users/my-tasks').catch(() => ({ tasks: [] as TaskRow[] }));
      setTaskSummary({
        open: (taskData.tasks || []).filter((task) => !task.done).length,
        done: (taskData.tasks || []).filter((task) => task.done).length,
      });
      const orgData = await api<OrgDirectoryRes>('/api/users/org-directory').catch(() => ({
        total: 0,
        sections: [] as OrgDirectoryRes['sections'],
      }));
      setOrgSummary({
        total: orgData.total || 0,
        sections: (orgData.sections || []).filter((section) => section.people.length > 0).map((section) => section.label),
      });
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

        <TaskSummaryWidget summary={taskSummary} onOpen={() => onNavigate('tasks')} />

        <OrgSummaryWidget summary={orgSummary} onOpen={() => onNavigate('org')} />

        <NotificationsWidget notifications={notifications} birthdaysToday={birthdaysToday} />
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
  const totals = balance?.totals;
  const remainingPct = totals && totals.total > 0 ? Math.round((totals.remaining / totals.total) * 100) : 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Leave balance</p>
          <h3 className="mt-1 text-3xl font-bold text-slate-900">{totals?.remaining ?? '—'}</h3>
          <p className="mt-1 text-xs font-medium text-slate-500">
            days remaining in {balance?.year ?? new Date().getFullYear()}
          </p>
        </div>
        <div className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-800">
          {balance ? `${remainingPct}% left` : 'Loading'}
        </div>
      </div>
      {totals && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Used</p>
            <p className="mt-1 text-lg font-bold text-red-700">{totals.used}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total</p>
            <p className="mt-1 text-lg font-bold text-slate-900">{totals.total}</p>
          </div>
        </div>
      )}
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

function TaskSummaryWidget({ summary, onOpen }: { summary: { open: number; done: number }; onOpen: () => void }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">My tasks</p>
          <h3 className="mt-1 text-3xl font-bold text-slate-900">{summary.open}</h3>
          <p className="mt-1 text-sm text-slate-600">open task{summary.open === 1 ? '' : 's'} for today</p>
        </div>
        <div className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-800">{summary.done} done</div>
      </div>
      <button
        type="button"
        className="mt-4 w-full rounded-lg bg-avgc-brand px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
        onClick={onOpen}
      >
        Open My Tasks
      </button>
    </div>
  );
}

function OrgSummaryWidget({
  summary,
  onOpen,
}: {
  summary: { total: number; sections: string[] };
  onOpen: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Org chart</p>
      <h3 className="mt-1 text-3xl font-bold text-slate-900">{summary.total || '—'}</h3>
      <p className="mt-1 text-sm text-slate-600">people loaded from HRMS</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {(summary.sections.length ? summary.sections : ['Founder', 'Managers', 'Employees']).slice(0, 4).map((section) => (
          <span key={section} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            {section}
          </span>
        ))}
      </div>
      <button
        type="button"
        className="mt-4 w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        onClick={onOpen}
      >
        View Org Chart
      </button>
    </div>
  );
}

function NotificationsWidget({
  notifications,
  birthdaysToday,
}: {
  notifications: NotificationRow[];
  birthdaysToday: BirthdayPerson[];
}) {
  const visible = notifications.slice(0, 4);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notifications</p>
          <h3 className="mt-1 text-lg font-bold text-slate-900">Announcements & alerts</h3>
        </div>
        <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
          {notifications.filter((n) => !n.isRead).length} unread
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {birthdaysToday.length > 0 && (
          <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            Birthdays today: {birthdaysToday.map((person) => person.name).join(', ')}
          </div>
        )}
        {visible.length === 0 ? (
          <p className="text-sm text-slate-500">No announcements or notifications yet.</p>
        ) : (
          visible.map((item) => (
            <div key={item.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {item.type === 'broadcast' ? 'Announcement' : item.type.replace(/_/g, ' ')}
              </p>
              <p className="mt-1 text-sm text-slate-800">{item.message}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
