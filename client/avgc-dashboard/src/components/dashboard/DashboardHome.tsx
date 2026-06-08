import { useCallback, useEffect, useState } from 'react';
import { MiniCalendar } from '@/components/ui/MiniCalendar';
import { ApiError, api } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { EmployeeUser } from '@/types/employee';
import type { PortalNavId } from '@/lib/portalNav';

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

type AttendanceSummary = {
  present: number;
  halfday: number;
  absent: number;
  leave?: number;
  holidays?: number;
};

type Props = {
  user: EmployeeUser | null;
  onNavigate: (id: PortalNavId) => void;
  onPasswordRequired: (msg?: string) => void;
};

const QUICK_ACTIONS: { label: string; nav: PortalNavId }[] = [
  { label: 'Apply for leave', nav: 'leave-apply' },
  { label: 'Attendance', nav: 'attendance' },
  { label: 'Asset management', nav: 'asset-management' },
  { label: 'Policies & links', nav: 'policies-and-links' },
];

export function DashboardHome({ user, onNavigate, onPasswordRequired }: Props) {
  const [leaveBalance, setLeaveBalance] = useState<LeaveBalanceRes | null>(null);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();
      const tasks: Promise<void>[] = [];

      if (user?.id) {
        tasks.push(
          api<LeaveBalanceRes>(`/api/leave-balance/${user.id}`)
            .then((balance) => setLeaveBalance(balance))
            .catch(() => setLeaveBalance(null))
        );
      }
      tasks.push(
        api<{ notifications?: NotificationRow[] }>('/api/notifications')
          .then((n) => setNotifications(n.notifications || []))
          .catch(() => setNotifications([]))
      );
      tasks.push(
        api<AttendanceSummary>(`/api/attendance/summary?month=${month}&year=${year}`)
          .then((s) => setSummary(s))
          .catch(() => setSummary(null))
      );
      await Promise.all(tasks);
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

  const designation = user?.designation?.trim() || '—';
  const department = user?.department?.trim() || '—';
  const empId = user?.employeecode?.trim() || '—';
  const totals = leaveBalance?.totals;
  const unread = notifications.filter((n) => !n.isRead).length;
  const year = leaveBalance?.year ?? new Date().getFullYear();

  const stats = [
    { label: 'Present', value: summary?.present ?? 0, tone: 'present' as const },
    { label: 'Half Day', value: summary?.halfday ?? 0, tone: 'half' as const },
    { label: 'Leave days', value: summary?.leave ?? 0, tone: 'leave' as const },
    { label: 'Absent', value: summary?.absent ?? 0, tone: 'absent' as const },
  ];

  return (
    <div className="dashboard-home-viewport" id="employeeLeaveBalancePanel">
      <section className="dashboard-home-card dashboard-home-hero">
        <p className="dashboard-home-eyebrow">Welcome back</p>
        <h2 className="dashboard-home-name">{user?.name?.trim() || 'Employee'}</h2>
        <p className="dashboard-home-meta">
          <span>{designation}</span>
          <span className="dashboard-home-dot" aria-hidden="true" />
          <span>{department}</span>
        </p>
        <span className="dashboard-home-id-pill">ID {empId}</span>
      </section>

      <section className="dashboard-home-stats" aria-label="Attendance this month">
        {stats.map((item) => (
          <div key={item.label} className={`dashboard-home-stat dashboard-home-stat--${item.tone}`}>
            <p className="dashboard-home-stat-label">{item.label}</p>
            <p className="dashboard-home-stat-value">{loading ? '…' : String(item.value)}</p>
          </div>
        ))}
      </section>

      <section className="dashboard-home-card dashboard-home-announce">
        <div className="dashboard-home-card-head">
          <div>
            <h3 className="dashboard-home-card-title">Announcements</h3>
            <p className="dashboard-home-card-sub">
              Latest from HR{unread > 0 ? ` · ${unread} unread` : ''}
            </p>
          </div>
        </div>
        <div className="dashboard-home-announce-feed">
          {notifications.length === 0 ? (
            <p className="dashboard-home-empty">No announcements yet.</p>
          ) : (
            notifications.slice(0, 8).map((item) => (
              <article
                key={item.id}
                className={`dashboard-home-announce-item${item.isRead ? '' : ' is-unread'}`}
              >
                <p className="dashboard-home-announce-type">
                  {item.type === 'broadcast' ? 'Announcement' : item.type.replace(/_/g, ' ')}
                </p>
                <p className="dashboard-home-announce-msg">{item.message}</p>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="dashboard-home-card dashboard-home-mini-cal-wrap">
        <MiniCalendar onOpenCalendar={() => onNavigate('calendar')} />
      </section>

      <section className="dashboard-home-card dashboard-home-actions">
        <h3 className="dashboard-home-card-title">Quick actions</h3>
        <div className="dashboard-home-action-grid">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.nav}
              type="button"
              className="btn btn-outline btn-sm"
              data-nav-jump={action.nav}
              onClick={() => onNavigate(action.nav)}
            >
              {action.label}
            </button>
          ))}
        </div>
      </section>

      <section className="dashboard-home-card dashboard-home-leave">
        <div className="dashboard-home-leave-head">
          <div>
            <h3 className="dashboard-home-card-title">My leave balance</h3>
            <p className="dashboard-home-card-sub" id="employeeLeaveBalanceSummary">
              {loading
                ? 'Loading…'
                : totals
                  ? `${year}: ${totals.remaining} days remaining of ${totals.total}`
                  : 'Not available yet'}
            </p>
          </div>
          <div className="dashboard-home-leave-totals">
            <div className="dashboard-home-leave-chip">
              <span>Remaining</span>
              <strong>{totals?.remaining ?? (loading ? '…' : '—')}</strong>
            </div>
            <div className="dashboard-home-leave-chip">
              <span>Used</span>
              <strong>{totals?.used ?? (loading ? '…' : '—')}</strong>
            </div>
            <div className="dashboard-home-leave-chip">
              <span>Total</span>
              <strong>{totals?.total ?? (loading ? '…' : '—')}</strong>
            </div>
          </div>
        </div>
        {(leaveBalance?.balances || []).length > 0 && (
          <div className="dashboard-home-leave-types">
            {leaveBalance!.balances.map((item) => (
              <div key={item.type} className="dashboard-home-leave-type">
                <span className="dashboard-home-leave-type-name">{item.type}</span>
                <span className="dashboard-home-leave-type-val">
                  <strong>{item.remaining}</strong> left · {item.used} used · {item.total} total
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
