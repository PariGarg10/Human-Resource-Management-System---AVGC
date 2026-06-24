import { useCallback, useEffect, useState } from 'react';
import { MiniCalendar } from '@/components/ui/MiniCalendar';
import { ApiError, api } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { EmployeeUser } from '@/types/employee';
import { resolveNotificationNav } from '@/lib/notificationNav';
import type { PortalNavId, PortalRole } from '@/lib/portalNav';
import { PortalUserIdentity } from '@/components/PortalUserIdentity';
import { ManagerTeamAttendanceWidget } from '@/components/dashboard/ManagerTeamAttendanceWidget';

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

type ManagerDashboardSummary = {
  date: string;
  totalemployees: number;
  pendingleaves: number;
  todaysummary: AttendanceSummary;
};

type Props = {
  user: EmployeeUser | null;
  portalRole?: PortalRole;
  onNavigate: (id: PortalNavId) => void;
  onPasswordRequired: (msg?: string) => void;
};

const EMPLOYEE_QUICK_ACTIONS: { label: string; nav: PortalNavId }[] = [
  { label: 'Apply for leave', nav: 'leave-apply' },
  { label: 'Attendance', nav: 'attendance' },
  { label: 'Asset management', nav: 'asset-management' },
  { label: 'Policies & links', nav: 'policies-and-links' },
];

const MANAGER_QUICK_ACTIONS: { label: string; nav: PortalNavId }[] = [
  { label: 'Approve leave', nav: 'leave-approval' },
  { label: 'Team attendance', nav: 'team-attendance' },
  { label: 'Attendance', nav: 'attendance' },
  { label: 'Policies & links', nav: 'policies-and-links' },
];

export function DashboardHome({ user, portalRole = 'employee', onNavigate, onPasswordRequired }: Props) {
  const isManager = portalRole === 'manager';
  const [leaveBalance, setLeaveBalance] = useState<LeaveBalanceRes | null>(null);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [managerSummary, setManagerSummary] = useState<ManagerDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api<{
        leaveBalance: LeaveBalanceRes | null;
        notifications: NotificationRow[];
        unreadCount?: number;
        attendanceSummary: AttendanceSummary | null;
        managerSummary: ManagerDashboardSummary | null;
      }>('/api/dashboard/home');

      setLeaveBalance(data.leaveBalance);
      setNotifications(data.notifications || []);
      const hrms = (window as { HRMS?: { setNotificationBadge?: (n: number) => void } }).HRMS;
      hrms?.setNotificationBadge?.(data.unreadCount ?? data.notifications?.filter((n) => !n.isRead).length ?? 0);
      if (portalRole === 'manager' && data.managerSummary) {
        setManagerSummary(data.managerSummary);
        setSummary(data.managerSummary.todaysummary);
      } else {
        setManagerSummary(null);
        setSummary(data.attendanceSummary);
      }
    } catch (e) {
      if (e instanceof ApiError && e.requiresPasswordChange) {
        onPasswordRequired(e.message);
        return;
      }
      // Fallback: original parallel endpoints if combined route unavailable
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
        if (portalRole === 'manager') {
          tasks.push(
            api<ManagerDashboardSummary>('/api/manager/dashboard-summary')
              .then((s) => {
                setManagerSummary(s);
                setSummary(s.todaysummary);
              })
              .catch(() => {
                setManagerSummary(null);
                setSummary(null);
              })
          );
        } else {
          tasks.push(
            api<AttendanceSummary>(`/api/attendance/summary?month=${month}&year=${year}`)
              .then((s) => setSummary(s))
              .catch(() => setSummary(null))
          );
        }
        await Promise.all(tasks);
      } catch (fallbackErr) {
        if (fallbackErr instanceof ApiError && fallbackErr.requiresPasswordChange) {
          onPasswordRequired(fallbackErr.message);
          return;
        }
        toast(fallbackErr instanceof Error ? fallbackErr.message : 'Could not load dashboard', 'error');
      }
    } finally {
      setLoading(false);
    }
  }, [onPasswordRequired, portalRole, user?.id]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const totals = leaveBalance?.totals;
  const unreadItems = notifications.filter((n) => !n.isRead);
  const unread = unreadItems.length;

  const handleAnnouncementClick = async (item: NotificationRow) => {
    try {
      await api(`/api/notifications/${item.id}/read`, { method: 'PATCH' });
    } catch {
      /* still navigate */
    }
    setNotifications((prev) => prev.filter((n) => n.id !== item.id));
    const nav = resolveNotificationNav(item.type, item.message, user?.role);
    onNavigate(nav);
  };
  const year = leaveBalance?.year ?? new Date().getFullYear();

  const stats = isManager
    ? [
        { label: 'Team size', value: managerSummary?.totalemployees ?? 0, tone: 'neutral' as const },
        { label: 'Present today', value: summary?.present ?? 0, tone: 'present' as const },
        { label: 'On leave today', value: summary?.leave ?? 0, tone: 'leave' as const },
        {
          label: 'Pending approvals',
          value: managerSummary?.pendingleaves ?? 0,
          tone: 'pending' as const,
        },
      ]
    : [
        { label: 'Present', value: summary?.present ?? 0, tone: 'present' as const },
        { label: 'Half Day', value: summary?.halfday ?? 0, tone: 'half' as const },
        { label: 'Leave days', value: summary?.leave ?? 0, tone: 'leave' as const },
        { label: 'Absent', value: summary?.absent ?? 0, tone: 'absent' as const },
      ];

  const quickActions = isManager ? MANAGER_QUICK_ACTIONS : EMPLOYEE_QUICK_ACTIONS;
  const maxAnnouncements = 4;

  return (
    <div
      className={`dashboard-home-viewport${isManager ? ' dashboard-home-viewport--manager' : ''}`}
      id="employeeLeaveBalancePanel"
    >
      <section className="dashboard-home-card dashboard-home-hero">
        <PortalUserIdentity user={user} variant="hero" />
      </section>

      <section
        className="dashboard-home-stats"
        aria-label={isManager ? 'Team attendance today' : 'Attendance this month'}
      >
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
          {unreadItems.length === 0 ? (
            <p className="dashboard-home-empty">No new announcements.</p>
          ) : (
            unreadItems.slice(0, maxAnnouncements).map((item) => (
              <button
                key={item.id}
                type="button"
                className="dashboard-home-announce-item is-unread dashboard-home-announce-item--clickable"
                onClick={() => {
                  handleAnnouncementClick(item).catch(() => undefined);
                }}
              >
                <p className="dashboard-home-announce-type">
                  {item.type === 'broadcast' ? 'Announcement' : item.type.replace(/_/g, ' ')}
                </p>
                <p className="dashboard-home-announce-msg">{item.message}</p>
              </button>
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
          {quickActions.map((action) => (
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
          <div className="dashboard-home-leave-types dashboard-home-leave-types--detail">
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

      {isManager ? (
        <ManagerTeamAttendanceWidget
          onNavigate={onNavigate}
          variant="footer"
          summaryCounts={
            managerSummary
              ? {
                  present:
                    (managerSummary.todaysummary.present ?? 0) +
                    (managerSummary.todaysummary.halfday ?? 0),
                  onLeave: managerSummary.todaysummary.leave ?? 0,
                }
              : null
          }
        />
      ) : null}
    </div>
  );
}
