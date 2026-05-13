import {
  Calendar,
  ClipboardList,
  History,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeft,
  Settings,
  User,
  FileEdit,
  MessageSquare,
  UsersRound,
} from 'lucide-react';
import { cn } from '@/lib/cn';

export type NavId =
  | 'dashboard'
  | 'attendance'
  | 'calendar'
  | 'leave-apply'
  | 'leave-history'
  | 'profile'
  | 'settings';

const items: { id: NavId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'attendance', label: 'My Attendance', icon: ClipboardList },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'leave-apply', label: 'Apply Leave', icon: FileEdit },
  { id: 'leave-history', label: 'Leave History', icon: History },
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'settings', label: 'Settings', icon: Settings },
];

type Props = {
  active: NavId;
  onNavigate: (id: NavId) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  userName: string;
  userInitial: string;
  onLogout: () => void;
  mobileOpen: boolean;
};

export function Sidebar({
  active,
  onNavigate,
  collapsed,
  onToggleCollapse,
  userName,
  userInitial,
  onLogout,
  mobileOpen,
}: Props) {
  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-50 flex h-screen flex-col border-r border-slate-200 bg-white shadow-sm transition-[width,transform] duration-200 md:z-40',
        collapsed ? 'w-[72px]' : 'w-64',
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      )}
      aria-label="Primary navigation"
    >
      <div className="flex h-16 items-center gap-2 border-b border-slate-100 px-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1A237E] text-sm font-bold text-white">
          AV
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-sm font-bold tracking-tight text-slate-900">AVGC</div>
            <div className="truncate text-xs text-slate-500">Employee Hub</div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 border-b border-slate-100 px-3 py-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-[#1A237E]">
          {userInitial}
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">{userName}</div>
            <div className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600">
              <MessageSquare className="h-3 w-3" aria-hidden />
              Employee
            </div>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        <a
          href="/managers"
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-600 transition-colors min-h-[44px] hover:bg-slate-50 hover:text-slate-900"
        >
          <UsersRound className="h-5 w-5 shrink-0" aria-hidden />
          {!collapsed && <span>Managers</span>}
        </a>
        {items.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onNavigate(id)}
            className={cn(
              'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors min-h-[44px]',
              active === id
                ? 'bg-[#1A237E]/10 text-[#1A237E]'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            )}
            aria-current={active === id ? 'page' : undefined}
          >
            <Icon className="h-5 w-5 shrink-0" aria-hidden />
            {!collapsed && <span>{label}</span>}
          </button>
        ))}
      </nav>

      <div className="border-t border-slate-100 p-3 space-y-2">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 min-h-[44px]"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeft className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          {!collapsed && <span>Collapse</span>}
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 min-h-[44px]"
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && 'Sign out'}
        </button>
      </div>
    </aside>
  );
}
