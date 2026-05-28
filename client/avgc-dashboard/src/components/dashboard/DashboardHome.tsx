import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { EmployeeUser } from '@/types/employee';
import type { NavId } from '@/components/layout/Sidebar';
import { EmployeeSpotlight } from '@/components/dashboard/EmployeeSpotlight';
import { PunchPanel } from '@/views/PunchPanel';

type TodayRes = {
  record: {
    punchin?: string | null;
    punchout?: string | null;
    status?: string;
    holidayName?: string;
    holidayType?: string;
  } | null;
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

export function DashboardHome({ user, onNavigate, onPasswordRequired }: Props) {
  const [today, setToday] = useState<TodayRes | null>(null);
  const [leaveBalance, setLeaveBalance] = useState<LeaveBalanceRes | null>(null);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const t = await api<TodayRes>('/api/attendance/today');
      setToday(t);
      if (user?.id) {
        const balance = await api<LeaveBalanceRes>(`/api/leave-balance/${user.id}`).catch(() => null);
        setLeaveBalance(balance);
      }
      const n = await api<{ notifications?: NotificationRow[] }>('/api/notifications').catch(() => ({
        notifications: [] as NotificationRow[],
      }));
      setNotifications(n.notifications || []);
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

  return (
    <div className="space-y-6">
      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
          Loading dashboard…
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-6">
        <EmployeeSpotlight user={user} punchIn={punchIn} punchOut={punchOut} />

        <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm lg:col-span-4">
          <p className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Punch in / out</p>
          <PunchPanel />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Apply for leave</p>
          <p className="mt-2 text-sm text-slate-600">Submit leave requests with one click.</p>
          <button
            type="button"
            onClick={() => onNavigate('leave-apply')}
            className="mt-4 w-full rounded-xl bg-avgc-brand px-4 py-3 text-sm font-semibold text-white hover:bg-avgc-brand-hover"
          >
            Open Leave Form
          </button>
        </div>

        <LeaveBalanceWidget balance={leaveBalance} />

        <AnnouncementsWidget notifications={notifications} />
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

function AnnouncementsWidget({ notifications }: { notifications: NotificationRow[] }) {
  const visible = notifications.slice(0, 4);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Announcements</p>
          <h3 className="mt-1 text-lg font-bold text-slate-900">Latest updates</h3>
        </div>
        <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
          {notifications.filter((n) => !n.isRead).length} unread
        </div>
      </div>
      <div className="mt-4 space-y-3">
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
