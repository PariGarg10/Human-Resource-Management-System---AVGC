import { useCallback, useEffect, useState } from 'react';
import { FileEdit } from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { EmployeeUser } from '@/types/employee';
import type { NavId } from '@/components/layout/Sidebar';

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
  const [leaveBalance, setLeaveBalance] = useState<LeaveBalanceRes | null>(null);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
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

  const designation = user?.designation?.trim() || '—';
  const department = user?.department?.trim() || '—';
  const empId = user?.employeecode?.trim() || '—';

  return (
    <div className="space-y-5">
      {loading && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6 text-sm text-[var(--text-muted)] shadow-sm">
          Loading dashboard…
        </div>
      )}

      <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-sm md:p-8">
        <h1 className="font-['Bebas_Neue',sans-serif] text-3xl font-bold tracking-wide text-[var(--text-primary)] md:text-4xl">
          {user?.name?.trim() || 'Employee'}
        </h1>
        <p className="mt-2 font-['DM_Sans',sans-serif] text-base font-medium text-[var(--text-primary)]">
          {designation}
          <span className="mx-2 text-[var(--text-muted)]" aria-hidden>
            ·
          </span>
          {department}
        </p>
        <p className="mt-3 font-['DM_Sans',sans-serif] text-sm text-[var(--text-muted)]">
          <span className="font-semibold uppercase tracking-wide text-[var(--text-muted)]">Employee ID</span>
          <span className="ml-2 font-mono text-base font-semibold text-[var(--text-primary)]">{empId}</span>
        </p>
      </section>

      <AnnouncementsColumn notifications={notifications} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <LeaveBalanceSection balance={leaveBalance} loading={loading} />
        <QuickActionsColumn onApplyLeave={() => onNavigate('leave-apply')} />
      </div>
    </div>
  );
}

function LeaveBalanceSection({
  balance,
  loading,
}: {
  balance: LeaveBalanceRes | null;
  loading: boolean;
}) {
  const totals = balance?.totals;
  const remainingPct =
    totals && totals.total > 0 ? Math.round((totals.remaining / totals.total) * 100) : 0;

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-['Bebas_Neue',sans-serif] text-xl tracking-wide text-[var(--text-primary)]">
            Leave balance
          </h2>
          <p className="mt-1 font-['DM_Sans',sans-serif] text-sm text-[var(--text-muted)]">
            {balance?.year ?? new Date().getFullYear()} entitlement summary
          </p>
        </div>
        {totals && (
          <div className="rounded-full bg-[rgba(237,29,36,0.1)] px-3 py-1 text-xs font-bold text-[#ed1d24]">
            {remainingPct}% remaining
          </div>
        )}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <BalanceStat label="Days remaining" value={totals?.remaining ?? (loading ? '…' : '—')} highlight />
        <BalanceStat label="Used" value={totals?.used ?? (loading ? '…' : '—')} />
        <BalanceStat label="Total allowance" value={totals?.total ?? (loading ? '…' : '—')} />
      </div>

      <div className="mt-5 space-y-3">
        {(balance?.balances || []).map((item) => {
          const pct = item.total > 0 ? Math.min(100, Math.round((item.used / item.total) * 100)) : 0;
          return (
            <div key={item.type}>
              <div className="flex justify-between font-['DM_Sans',sans-serif] text-xs font-medium text-[var(--text-muted)]">
                <span>{item.type}</span>
                <span>
                  {item.remaining} left · {item.used} used of {item.total}
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
                <div
                  className="h-full rounded-full bg-[#ed1d24]"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
        {!loading && !balance && (
          <p className="font-['DM_Sans',sans-serif] text-sm text-[var(--text-muted)]">
            Leave balance is not available yet.
          </p>
        )}
      </div>
    </section>
  );
}

function BalanceStat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border border-[var(--border)] p-4 ${
        highlight ? 'bg-[rgba(237,29,36,0.06)]' : 'bg-[var(--bg-secondary)]'
      }`}
    >
      <p className="font-['DM_Sans',sans-serif] text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </p>
      <p
        className={`mt-1 font-['Bebas_Neue',sans-serif] text-3xl tracking-wide ${
          highlight ? 'text-[#ed1d24]' : 'text-[var(--text-primary)]'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function AnnouncementsColumn({ notifications }: { notifications: NotificationRow[] }) {
  const visible = notifications.slice(0, 6);
  const unread = notifications.filter((n) => !n.isRead).length;

  return (
    <section className="flex h-full min-h-[280px] flex-col rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-['Bebas_Neue',sans-serif] text-xl tracking-wide text-[var(--text-primary)]">
            Announcements
          </h2>
          <p className="mt-1 font-['DM_Sans',sans-serif] text-sm text-[var(--text-muted)]">
            Latest updates from HR
          </p>
        </div>
        {unread > 0 && (
          <span className="rounded-full bg-[var(--bg-secondary)] px-3 py-1 text-xs font-bold text-[var(--text-primary)]">
            {unread} unread
          </span>
        )}
      </div>
      <div className="mt-4 flex-1 space-y-3 overflow-y-auto">
        {visible.length === 0 ? (
          <p className="font-['DM_Sans',sans-serif] text-sm text-[var(--text-muted)]">
            No announcements yet.
          </p>
        ) : (
          visible.map((item) => (
            <article
              key={item.id}
              className={`rounded-lg border px-3 py-3 ${
                item.isRead
                  ? 'border-[var(--border)] bg-[var(--bg-secondary)]'
                  : 'border-[rgba(237,29,36,0.25)] bg-[rgba(237,29,36,0.04)]'
              }`}
            >
              <p className="font-['DM_Sans',sans-serif] text-[10px] font-bold uppercase tracking-wide text-[#ed1d24]">
                {item.type === 'broadcast' ? 'Announcement' : item.type.replace(/_/g, ' ')}
              </p>
              <p className="mt-1 font-['DM_Sans',sans-serif] text-sm leading-snug text-[var(--text-primary)]">
                {item.message}
              </p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function QuickActionsColumn({ onApplyLeave }: { onApplyLeave: () => void }) {
  return (
    <section className="flex h-full min-h-[280px] flex-col rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-sm">
      <div>
        <h2 className="font-['Bebas_Neue',sans-serif] text-xl tracking-wide text-[var(--text-primary)]">
          Quick actions
        </h2>
        <p className="mt-1 font-['DM_Sans',sans-serif] text-sm text-[var(--text-muted)]">
          Common tasks you can start right away
        </p>
      </div>
      <div className="mt-5 flex flex-1 flex-col gap-3">
        <button
          type="button"
          onClick={onApplyLeave}
          className="flex w-full items-center gap-4 rounded-xl border border-[rgba(237,29,36,0.35)] bg-[rgba(237,29,36,0.08)] px-4 py-4 text-left transition hover:border-[#ed1d24] hover:bg-[rgba(237,29,36,0.14)]"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#ed1d24] text-white">
            <FileEdit className="h-5 w-5" aria-hidden />
          </span>
          <span>
            <span className="block font-['DM_Sans',sans-serif] text-base font-semibold text-[var(--text-primary)]">
              Apply for leave
            </span>
            <span className="mt-0.5 block font-['DM_Sans',sans-serif] text-sm text-[var(--text-muted)]">
              Submit a new leave request
            </span>
          </span>
        </button>
      </div>
    </section>
  );
}
