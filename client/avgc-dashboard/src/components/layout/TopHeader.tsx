import { ChevronDown, Menu, Search, Bell } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useUser } from '@/context/UserContext';

type NotifRow = {
  id: number;
  message: string;
  type: string;
  isRead: boolean;
  createdAt?: string;
};

type Props = {
  title: string;
  searchPlaceholder?: string;
  onSearchChange?: (q: string) => void;
  onMenuClick?: () => void;
};

export function TopHeader({
  title,
  searchPlaceholder = 'Find employees…',
  onSearchChange,
  onMenuClick,
}: Props) {
  const { user, avatarOverride } = useUser();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const notifWrapRef = useRef<HTMLDivElement>(null);

  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotifRow[]>([]);

  const loadNotifications = useCallback(async () => {
    try {
      const path = user?.id ? `/api/notifications/${user.id}` : '/api/notifications';
      const data = await api<{ notifications: NotifRow[] }>(path);
      setNotifications(data.notifications || []);
    } catch {
      /* ignore poll errors */
    }
  }, [user?.id]);

  useEffect(() => {
    loadNotifications().catch(() => {});
    const t = window.setInterval(() => {
      loadNotifications().catch(() => {});
    }, 60_000);
    return () => window.clearInterval(t);
  }, [loadNotifications]);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
      if (notifWrapRef.current && !notifWrapRef.current.contains(e.target as Node)) setNotifOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const initial = (user?.name || user?.email || '?').charAt(0).toUpperCase();
  const photo = avatarOverride || user?.profilePhotoUrl || null;
  const unread = notifications.filter((n) => !n.isRead).length;

  async function markRead(id: number) {
    try {
      await api(`/api/notifications/${id}/read`, { method: 'PATCH' });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
    } catch (e) {
      if (e instanceof ApiError && e.message) {
        /* noop */
      }
    }
  }

  return (
    <header className="sticky top-0 z-[100] flex h-16 shrink-0 items-center gap-4 border-b border-[var(--border)] bg-[var(--bg-card)]/95 px-4 backdrop-blur lg:px-6">
      {onMenuClick && (
        <button
          type="button"
          onClick={onMenuClick}
          className="rounded-xl border border-[var(--border)] p-2.5 text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] md:hidden min-h-[44px] min-w-[44px]"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-semibold tracking-tight text-[var(--text-primary)]">{title}</h1>
      </div>

      <div className="relative hidden max-w-md flex-1 md:block">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
          aria-hidden
        />
        <input
          type="search"
          placeholder={searchPlaceholder}
          value={q}
          onChange={(e) => {
            const v = e.target.value;
            setQ(v);
            onSearchChange?.(v);
          }}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] py-2.5 pl-10 pr-4 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] shadow-sm outline-none ring-avgc-brand/20 focus:border-avgc-brand focus:bg-[var(--bg-card)] focus:ring-4"
          aria-label="Find employees"
        />
      </div>

      <div className="relative" ref={notifWrapRef}>
        <button
          type="button"
          onClick={() => {
            setNotifOpen((o) => !o);
            if (!notifOpen) loadNotifications().catch(() => {});
          }}
          className="relative rounded-xl border border-[var(--border)] p-2.5 text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] min-h-[44px] min-w-[44px]"
          aria-label="Notifications"
          aria-expanded={notifOpen}
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-avgc-brand px-1 text-[10px] font-bold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
        {notifOpen && (
          <div className="absolute right-0 z-[110] mt-2 max-h-80 w-80 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-card)] py-2 shadow-lg">
            {notifications.length === 0 ? (
              <p className="px-4 py-3 text-sm text-[var(--text-muted)]">No notifications</p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {notifications.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      className={cn(
                        'flex w-full gap-2 px-4 py-3 text-left text-sm hover:bg-[var(--bg-secondary)]',
                        !n.isRead && 'bg-[var(--bg-secondary)]'
                      )}
                      onClick={() => {
                        if (!n.isRead) void markRead(n.id);
                      }}
                    >
                      <span className="shrink-0 text-base" aria-hidden>
                        {n.type === 'birthday' ? '🎂' : n.type === 'broadcast' ? '🔔' : '•'}
                      </span>
                      <span className="text-[var(--text-primary)]">{n.message}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="relative" ref={wrapRef}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1.5 pr-3 shadow-sm hover:bg-[var(--bg-secondary)] min-h-[44px]"
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label="User menu"
        >
          {photo ? (
            <img
              src={photo}
              alt=""
              className="h-9 w-9 rounded-lg object-cover"
              width={36}
              height={36}
            />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-avgc-brand text-sm font-semibold text-white">
              {initial}
            </span>
          )}
          <span className="hidden max-w-[140px] truncate text-sm font-medium text-[var(--text-primary)] lg:inline">
            {user?.name || user?.email || 'Account'}
          </span>
          <ChevronDown className={cn('h-4 w-4 text-[var(--text-muted)] transition', open && 'rotate-180')} />
        </button>
        {open && (
          <div
            role="menu"
            className="absolute right-0 mt-2 w-56 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] py-1 shadow-lg"
          >
            <div className="border-b border-[var(--border)] px-4 py-3">
              <div className="text-sm font-semibold text-[var(--text-primary)]">{user?.name || 'Employee'}</div>
              <div className="truncate text-xs text-[var(--text-muted)]">{user?.email}</div>
            </div>
            <button
              type="button"
              role="menuitem"
              className="block w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50"
              onClick={() => {
                localStorage.clear();
                window.location.href = '/login';
              }}
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
