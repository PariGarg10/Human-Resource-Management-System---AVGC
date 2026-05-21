import { useCallback, useEffect, useMemo, useState } from 'react';
import { CHAT_ENABLED } from '@/features/chat/constants';
import { AVGCBuzz } from '@/features/chat/AVGCBuzz';
import { DashboardHome } from '@/components/dashboard/DashboardHome';
import { PasswordGate } from '@/components/PasswordGate';
import { Sidebar, type NavId } from '@/components/layout/Sidebar';
import { TopHeader } from '@/components/layout/TopHeader';
import { ThemeFab } from '@/components/ThemeFab';
import { UserProvider } from '@/context/UserContext';
import { api, logout, readEmployee } from '@/lib/api';
import type { EmployeeUser, UserProfile } from '@/types/employee';
import { AttendancePanel } from '@/views/AttendancePanel';
import { CalendarPanel } from '@/views/CalendarPanel';
import { ConcernsInboxPanel, MyConcernsPanel, RaiseConcernPanel } from '@/views/HelpdeskPanels';
import { LeaveApplyPanel, LeaveHistoryPanel } from '@/views/LeavePanels';
import { OrgChartPanel } from '@/features/team-hub/OrgChartPanel';
import { TaskManagerPanel } from '@/features/team-hub/TaskManagerPanel';
import { ProfilePanel, SettingsPanel } from '@/views/ProfileSettingsPanels';
import { PunchPanel } from '@/views/PunchPanel';

const titles: Record<NavId, string> = {
  dashboard: 'Dashboard',
  tasks: 'My tasks',
  employees: 'Employees',
  teams: 'Teams',
  org: 'Org chart',
  attendance: 'My attendance',
  calendar: 'Attendance calendar',
  'leave-apply': 'Leave management',
  'leave-history': 'Leave history',
  'helpdesk-raise': 'Raise a concern',
  'helpdesk-my': 'My concerns',
  'helpdesk-inbox': 'Concerns inbox',
  punch: 'Punch in / out',
  profile: 'Profile',
  settings: 'Settings',
};

export default function App() {
  const [nav, setNav] = useState<NavId>('dashboard');
  const [user, setUser] = useState<EmployeeUser | null>(null);
  const [avatarOverride, setAvatarOverride] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [buzzOpen, setBuzzOpen] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1280px)').matches : false
  );
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | undefined>();
  const [mobileNav, setMobileNav] = useState(false);

  useEffect(() => {
    const path = window.location.pathname.replace(/\/$/, '') || '/';
    if (path === '/profile' || path === '/account/profile') {
      setNav('profile');
    }

    const token = localStorage.getItem('token');
    if (!token) {
      window.location.replace('/login');
      return;
    }
    const emp = readEmployee();
    if (!emp) {
      localStorage.clear();
      window.location.replace('/login');
      return;
    }
    const role = String(emp.role || 'employee').toLowerCase().trim();
    if (!['employee', 'manager', 'admin', 'it_head'].includes(role)) {
      localStorage.clear();
      window.location.replace('/login');
      return;
    }
    if (role === 'manager') {
      window.location.replace('/manager/dashboard');
      return;
    }
    if (role === 'admin') {
      window.location.replace('/admin/dashboard');
      return;
    }
    setUser(emp);
    if (emp.mustchangepassword) {
      setPasswordRequired(true);
    }

    api<{ profile: UserProfile }>('/api/users/me')
      .then((data) => {
        const p = data.profile;
        const merged: EmployeeUser = {
          ...emp,
          name: p.name,
          email: p.email,
          department: p.department ?? emp.department,
          employeecode: p.employeecode ?? emp.employeecode,
          dateOfBirth: p.dateOfBirth,
          phone: p.phone,
          location: p.location,
          bio: p.bio,
          profilePhotoUrl: p.profilePhotoUrl,
          age: p.age,
        };
        localStorage.setItem('employee', JSON.stringify(merged));
        setUser(merged);
      })
      .catch(() => {});
  }, []);

  const initial = useMemo(
    () => (user?.name || user?.email || 'E').charAt(0).toUpperCase(),
    [user]
  );

  const onPasswordRequired = useCallback((msg?: string) => {
    setPasswordRequired(true);
    setPasswordMessage(msg);
  }, []);

  const userCtx = useMemo(
    () => ({ user, setUser, avatarOverride, setAvatarOverride }),
    [user, avatarOverride]
  );

  return (
    <UserProvider value={userCtx}>
      <div className="min-h-screen bg-[var(--bg-primary)]">
        <ThemeFab />
        {mobileNav && (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            aria-label="Close menu"
            onClick={() => setMobileNav(false)}
          />
        )}

        <Sidebar
          active={nav}
          onNavigate={(id) => {
            setNav(id);
            setMobileNav(false);
          }}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((c) => !c)}
          userName={user?.name || 'Employee'}
          userInitial={initial}
          userRole={user?.role || 'employee'}
          onLogout={() => logout()}
          mobileOpen={mobileNav}
        />

        <div
          className={`flex min-h-screen flex-col transition-[margin] duration-200 ${
            collapsed ? 'md:ml-[72px]' : 'md:ml-64'
          }`}
        >
          <TopHeader
            title={titles[nav]}
            onSearchChange={() => {}}
            onMenuClick={() => setMobileNav(true)}
          />

          <div
            className={`flex min-h-0 flex-1 flex-col ${CHAT_ENABLED ? 'xl:flex-row' : ''}`}
          >
            <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
              {passwordRequired && (
                <div className="mb-6">
                  <PasswordGate message={passwordMessage} />
                </div>
              )}
              {nav === 'dashboard' && (
                <DashboardHome
                  user={user}
                  onNavigate={(id) => setNav(id)}
                  onPasswordRequired={onPasswordRequired}
                />
              )}
              {nav === 'tasks' && (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm md:p-6">
                  <TaskManagerPanel userName={user?.name} />
                </div>
              )}
              {nav === 'employees' && (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-sm">
                  <h2 className="font-['Bebas_Neue',sans-serif] text-xl tracking-wide text-[var(--text-primary)]">
                    Employees
                  </h2>
                  <p className="mt-2 font-['DM_Sans',sans-serif] text-sm text-[var(--text-muted)]">
                    See the org chart for team members by group.
                  </p>
                </div>
              )}
              {nav === 'teams' && (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm md:p-6">
                  <OrgChartPanel />
                </div>
              )}
              {nav === 'org' && (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm md:p-6">
                  <OrgChartPanel />
                </div>
              )}
              {nav === 'attendance' && <AttendancePanel />}
              {nav === 'calendar' && <CalendarPanel />}
              {nav === 'leave-apply' && <LeaveApplyPanel />}
              {nav === 'leave-history' && <LeaveHistoryPanel />}
              {nav === 'helpdesk-raise' && <RaiseConcernPanel />}
              {nav === 'helpdesk-my' && <MyConcernsPanel />}
              {nav === 'helpdesk-inbox' && <ConcernsInboxPanel />}
              {nav === 'punch' && <PunchPanel />}
              {nav === 'profile' && (
                <ProfilePanel user={user} onProfileSaved={(u) => setUser(u)} />
              )}
              {nav === 'settings' && <SettingsPanel />}
            </main>

            {CHAT_ENABLED && (
              <AVGCBuzz
                open={buzzOpen}
                onToggle={() => setBuzzOpen((o) => !o)}
                userDepartment={user?.department}
              />
            )}
          </div>
        </div>

        {CHAT_ENABLED && buzzOpen && (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/20 xl:hidden"
            aria-label="Close buzz panel backdrop"
            onClick={() => setBuzzOpen(false)}
          />
        )}
      </div>
    </UserProvider>
  );
}
