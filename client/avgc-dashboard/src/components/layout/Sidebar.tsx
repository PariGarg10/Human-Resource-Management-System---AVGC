import {
  Calendar,
  ClipboardList,
  History,
  LayoutDashboard,
  LogOut,
  MapPin,
  Network,
  PanelLeftClose,
  PanelLeft,
  Settings,
  User,
  FileEdit,
  Headphones,
  Inbox,
  ListTodo,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/cn';

export type NavId =
  | 'dashboard'
  | 'tasks'
  | 'employees'
  | 'teams'
  | 'org'
  | 'attendance'
  | 'calendar'
  | 'leave-apply'
  | 'leave-history'
  | 'helpdesk-raise'
  | 'helpdesk-my'
  | 'helpdesk-inbox'
  | 'punch'
  | 'profile'
  | 'settings';

type NavItem = { id: NavId; label: string; icon: typeof LayoutDashboard };

const group1: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'tasks', label: 'My Tasks', icon: ListTodo },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
];

const group2: NavItem[] = [
  { id: 'employees', label: 'Employees', icon: Users },
  { id: 'teams', label: 'Teams', icon: Users },
  { id: 'org', label: 'Org Chart', icon: Network },
];

const group3: NavItem[] = [
  { id: 'attendance', label: 'Attendance', icon: ClipboardList },
  { id: 'leave-apply', label: 'Leave Management', icon: FileEdit },
  { id: 'leave-history', label: 'Leave History', icon: History },
  { id: 'punch', label: 'Punch In/Out', icon: MapPin },
];

const group4: NavItem[] = [
  { id: 'helpdesk-raise', label: 'Raise Concern', icon: Headphones },
  { id: 'helpdesk-my', label: 'My Concerns', icon: History },
  { id: 'helpdesk-inbox', label: 'Concerns Inbox', icon: Inbox },
];

const group5: NavItem[] = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'settings', label: 'Settings', icon: Settings },
];

function GroupLabel({ text }: { text: string }) {
  return (
    <div
      className="px-3 pb-1 pt-3 font-['DM_Sans',sans-serif] text-[10px] font-bold uppercase tracking-[2px] text-[#ed1d24]"
      style={{ letterSpacing: '2px' }}
    >
      {text}
    </div>
  );
}

function Divider() {
  return <div className="mx-3 my-2 h-px bg-[var(--border)]" />;
}

type Props = {
  active: NavId;
  onNavigate: (id: NavId) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  userName: string;
  userInitial: string;
  userRole: string;
  onLogout: () => void;
  mobileOpen: boolean;
};

function NavButton({
  id,
  label,
  icon: Icon,
  active,
  collapsed,
  onNavigate,
}: NavItem & { active: NavId; collapsed: boolean; onNavigate: (id: NavId) => void }) {
  const isActive = active === id;
  return (
    <button
      type="button"
      onClick={() => onNavigate(id)}
      className={cn(
        'flex w-full min-h-[44px] items-center gap-3 border-l-[3px] px-3 py-2.5 text-left font-["DM_Sans",sans-serif] text-sm font-medium transition-colors',
        isActive
          ? 'border-[#ed1d24] bg-[rgba(237,29,36,0.08)] text-[#ed1d24]'
          : 'border-transparent text-[var(--text-primary)] opacity-70 hover:opacity-100'
      )}
      aria-current={isActive ? 'page' : undefined}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden />
      {!collapsed && <span>{label}</span>}
    </button>
  );
}

export function Sidebar({
  active,
  onNavigate,
  collapsed,
  onToggleCollapse,
  userName,
  userInitial,
  userRole,
  onLogout,
  mobileOpen,
}: Props) {
  const normalizedRole = String(userRole || '').toLowerCase().trim();
  const roleLabel =
    normalizedRole === 'it_head'
      ? 'IT Head'
      : userRole
        ? userRole.replace(/^\w/, (c) => c.toUpperCase())
        : 'Employee';

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-50 flex h-screen flex-col border-r border-[var(--border)] bg-[var(--bg-secondary)] shadow-sm transition-[width,transform] duration-200 md:z-40',
        collapsed ? 'w-[72px]' : 'w-64',
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      )}
      aria-label="Primary navigation"
    >
      <div className="flex h-16 items-center gap-2 border-b border-[var(--border)] px-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#ed1d24] text-sm font-bold text-white">
          AV
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate font-['Bebas_Neue',sans-serif] text-lg tracking-wide text-[var(--text-primary)]">
              AVGC
            </div>
            <div className="truncate font-['DM_Sans',sans-serif] text-xs text-[var(--text-muted)]">Employee Hub</div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 border-b border-[var(--border)] px-3 py-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[rgba(237,29,36,0.1)] text-sm font-semibold text-[#ed1d24]">
          {userInitial}
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate font-['DM_Sans',sans-serif] text-sm font-semibold text-[var(--text-primary)]">
              {userName}
            </div>
            <div className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-[rgba(237,29,36,0.08)] px-2 py-0.5 font-['DM_Sans',sans-serif] text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
              <User className="h-3 w-3" aria-hidden />
              {roleLabel}
            </div>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-0 overflow-y-auto p-2">
        <GroupLabel text="My workspace" />
        {group1.map((item) => (
          <NavButton key={item.id} {...item} active={active} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
        <Divider />
        <GroupLabel text="People" />
        {group2.map((item) => (
          <NavButton key={item.id} {...item} active={active} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
        <Divider />
        <GroupLabel text="Time & attendance" />
        {group3.map((item) => (
          <NavButton key={item.id} {...item} active={active} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
        <Divider />
        <GroupLabel text="Helpdesk" />
        {group4.map((item) => (
          <NavButton key={item.id} {...item} active={active} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
        <Divider />
        <GroupLabel text="Account" />
        {group5.map((item) => (
          <NavButton key={item.id} {...item} active={active} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className="space-y-2 border-t border-[var(--border)] p-3">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 font-['DM_Sans',sans-serif] text-sm font-medium text-[var(--text-primary)] hover:bg-[rgba(237,29,36,0.06)]"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeft className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          {!collapsed && <span>Collapse</span>}
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-md bg-[#ed1d24] px-3 py-2 font-['DM_Sans',sans-serif] text-sm font-semibold text-white"
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && 'Sign out'}
        </button>
      </div>
    </aside>
  );
}
