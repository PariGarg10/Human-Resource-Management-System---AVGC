import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardHome } from '@/components/dashboard/DashboardHome';
import { EmployeeDashboardHome } from '@/components/employee/EmployeeDashboardHome';
import { EmployeeLayout } from '@/components/employee/EmployeeLayout';
import { EmployeeModuleOptions } from '@/components/employee/EmployeeModuleOptions';
import { PasswordGate } from '@/components/PasswordGate';
import { type NavId } from '@/components/layout/Sidebar';
import { ThemeFab } from '@/components/ThemeFab';
import { UserProvider } from '@/context/UserContext';
import { api, readEmployee } from '@/lib/api';
import {
  MODULE_DEFAULT_NAV,
  MODULE_NAV_IDS,
  MODULE_TITLES,
  moduleForNav,
  navAllowedInModule,
  type EmployeeModuleId,
} from '@/lib/employeeModules';
import type { EmployeeUser, UserProfile } from '@/types/employee';
import { AttendancePanel } from '@/views/AttendancePanel';
import { CalendarPanel } from '@/views/CalendarPanel';
import { ConcernsInboxPanel, MyConcernsPanel, RaiseConcernPanel } from '@/views/HelpdeskPanels';
import { LeaveApplyPanel, LeaveHistoryPanel } from '@/views/LeavePanels';
import { OrgChartPanel } from '@/features/team-hub/OrgChartPanel';
import { ProfilePanel, SettingsPanel } from '@/views/ProfileSettingsPanels';
import { PunchPanel } from '@/views/PunchPanel';

const titles: Record<NavId, string> = {
  dashboard: 'Dashboard',
  employees: 'Employees',
  teams: 'Teams',
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

function renderNavPanel(
  nav: NavId,
  user: EmployeeUser | null,
  setUser: (u: EmployeeUser) => void,
  onNavigate: (id: NavId) => void,
  onPasswordRequired: (msg?: string) => void
) {
  switch (nav) {
    case 'dashboard':
      return (
        <DashboardHome user={user} onNavigate={onNavigate} onPasswordRequired={onPasswordRequired} />
      );
    case 'employees':
      return (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-sm">
          <h2 className="font-['Bebas_Neue',sans-serif] text-xl tracking-wide text-[var(--text-primary)]">
            Employees
          </h2>
          <p className="mt-2 font-['DM_Sans',sans-serif] text-sm text-[var(--text-muted)]">
            See the org chart for team members by group.
          </p>
        </div>
      );
    case 'teams':
      return (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm md:p-6">
          <OrgChartPanel scope="same-team" />
        </div>
      );
    case 'attendance':
      return <AttendancePanel />;
    case 'calendar':
      return <CalendarPanel />;
    case 'leave-apply':
      return <LeaveApplyPanel />;
    case 'leave-history':
      return <LeaveHistoryPanel />;
    case 'helpdesk-raise':
      return <RaiseConcernPanel />;
    case 'helpdesk-my':
      return <MyConcernsPanel />;
    case 'helpdesk-inbox':
      return <ConcernsInboxPanel />;
    case 'punch':
      return <PunchPanel />;
    case 'profile':
      return <ProfilePanel user={user} onProfileSaved={(u) => setUser(u)} />;
    case 'settings':
      return <SettingsPanel />;
    default:
      return null;
  }
}

export default function App() {
  const [selectedModule, setSelectedModule] = useState<EmployeeModuleId | null>(null);
  const [nav, setNav] = useState<NavId>('dashboard');
  const [user, setUser] = useState<EmployeeUser | null>(null);
  const [avatarOverride, setAvatarOverride] = useState<string | null>(null);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | undefined>();
  const [viewPhase, setViewPhase] = useState<'picker' | 'module-picker' | 'module'>('picker');

  useEffect(() => {
    const path = window.location.pathname.replace(/\/$/, '') || '/';
    if (path === '/profile' || path === '/account/profile') {
      setSelectedModule('account');
      setNav('profile');
      setViewPhase('module');
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

  const onPasswordRequired = useCallback((msg?: string) => {
    setPasswordRequired(true);
    setPasswordMessage(msg);
  }, []);

  const userCtx = useMemo(
    () => ({ user, setUser, avatarOverride, setAvatarOverride }),
    [user, avatarOverride]
  );

  const openModule = useCallback((module: EmployeeModuleId) => {
    const navIds = MODULE_NAV_IDS[module];
    setSelectedModule(module);
    if (navIds.length <= 1) {
      setNav(MODULE_DEFAULT_NAV[module]);
      setViewPhase('module');
      return;
    }
    setViewPhase('module-picker');
  }, []);

  const backToModules = useCallback(() => {
    setSelectedModule(null);
    setViewPhase('picker');
  }, []);

  const openModuleNav = useCallback((id: NavId) => {
    if (!selectedModule) return;
    if (!navAllowedInModule(selectedModule, id)) return;
    setNav(id);
    setViewPhase('module');
  }, [selectedModule]);

  const onNavigate = useCallback(
    (id: NavId) => {
      if (selectedModule && !navAllowedInModule(selectedModule, id)) {
        const targetModule = moduleForNav(id);
        if (!targetModule) return;
        setSelectedModule(targetModule);
      }
      setNav(id);
      setViewPhase('module');
    },
    [selectedModule]
  );

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)] text-[var(--text-muted)]">
        Loading…
      </div>
    );
  }

  return (
    <UserProvider value={userCtx}>
      <div className="min-h-screen bg-[var(--bg-primary)]">
        <ThemeFab />

        {selectedModule === null ? (
          <div className={viewPhase === 'picker' ? 'emp-view-enter' : 'emp-view-exit'}>
            {passwordRequired && (
              <div className="mx-auto max-w-6xl px-4 pt-6 md:px-8">
                <PasswordGate message={passwordMessage} />
              </div>
            )}
            <EmployeeDashboardHome
              userName={user.name || user.email}
              onSelect={openModule}
            />
          </div>
        ) : (
          <>
            {viewPhase === 'module-picker' ? (
              <EmployeeModuleOptions
                module={selectedModule}
                title={MODULE_TITLES[selectedModule]}
                navLabels={titles}
                onBack={backToModules}
                onSelect={openModuleNav}
              />
            ) : (
              <div className="emp-view-enter flex min-h-screen flex-col">
                <EmployeeLayout
                  onBack={
                    selectedModule && MODULE_NAV_IDS[selectedModule].length > 1
                      ? () => setViewPhase('module-picker')
                      : backToModules
                  }
                >
                  <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
                    {passwordRequired && (
                      <div className="mb-6">
                        <PasswordGate message={passwordMessage} />
                      </div>
                    )}
                    {renderNavPanel(nav, user, setUser, onNavigate, onPasswordRequired)}
                  </main>
                </EmployeeLayout>
              </div>
            )}
          </>
        )}
      </div>
    </UserProvider>
  );
}
