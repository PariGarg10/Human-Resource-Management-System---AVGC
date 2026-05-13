import { useCallback, useEffect, useMemo, useState } from 'react';
import { AVGCBuzz } from '@/components/buzz/AVGCBuzz';
import { DashboardHome } from '@/components/dashboard/DashboardHome';
import { PasswordGate } from '@/components/PasswordGate';
import { Sidebar, type NavId } from '@/components/layout/Sidebar';
import { TopHeader } from '@/components/layout/TopHeader';
import { api, logout, readEmployee } from '@/lib/api';
import type { EmployeeUser, UserProfile } from '@/types/employee';
import { AttendancePanel } from '@/views/AttendancePanel';
import { CalendarPanel } from '@/views/CalendarPanel';
import { LeaveApplyPanel, LeaveHistoryPanel } from '@/views/LeavePanels';
import { ProfilePanel, SettingsPanel } from '@/views/ProfileSettingsPanels';

const titles: Record<NavId, string> = {
  dashboard: 'Dashboard',
  attendance: 'My attendance',
  calendar: 'Attendance calendar',
  'leave-apply': 'Apply for leave',
  'leave-history': 'Leave history',
  profile: 'Profile',
  settings: 'Settings',
};

export default function App() {
  const [nav, setNav] = useState<NavId>('dashboard');
  const [user, setUser] = useState<EmployeeUser | null>(null);
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
    if (role !== 'employee') {
      localStorage.clear();
      window.location.replace('/login');
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

  return (
    <div className="min-h-screen bg-slate-50">
      {mobileNav && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-900/40 md:hidden"
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
        onLogout={() => logout()}
        mobileOpen={mobileNav}
      />

      <div
        className={`flex min-h-screen flex-col transition-[margin] duration-200 ${
          collapsed ? 'md:ml-[72px]' : 'md:ml-64'
        }`}
      >
        <TopHeader
          user={user}
          title={titles[nav]}
          onSearchChange={() => {}}
          onMenuClick={() => setMobileNav(true)}
        />

        <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
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
            {nav === 'attendance' && <AttendancePanel />}
            {nav === 'calendar' && <CalendarPanel />}
            {nav === 'leave-apply' && <LeaveApplyPanel />}
            {nav === 'leave-history' && <LeaveHistoryPanel />}
            {nav === 'profile' && (
              <ProfilePanel user={user} onProfileSaved={(u) => setUser(u)} />
            )}
            {nav === 'settings' && <SettingsPanel />}
          </main>

          <AVGCBuzz
            open={buzzOpen}
            onToggle={() => setBuzzOpen((o) => !o)}
            userDepartment={user?.department}
          />
        </div>
      </div>

      {buzzOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-900/20 xl:hidden"
          aria-label="Close buzz panel backdrop"
          onClick={() => setBuzzOpen(false)}
        />
      )}
    </div>
  );
}
