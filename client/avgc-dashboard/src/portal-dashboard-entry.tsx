/**
 * Mounts the shared employee/manager dashboard home into admin HTML shell.
 */
import { useCallback, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DashboardHome } from '@/components/dashboard/DashboardHome';
import { UserProvider } from '@/context/UserContext';
import { api, readEmployee } from '@/lib/api';
import type { PortalNavId } from '@/lib/portalNav';
import type { EmployeeUser, UserProfile } from '@/types/employee';
import './index.css';

const roots = new WeakMap<HTMLElement, Root>();

/** Admin sidebar uses different section ids than the React portal. */
const ADMIN_NAV_MAP: Partial<Record<PortalNavId, string>> = {
  dashboard: 'dashboard',
  calendar: 'calendar',
  'holiday-calendar': 'holiday-calendar',
  attendance: 'attendance',
  'leave-apply': 'leaves',
  'leave-history': 'leaves',
  'leave-approval': 'leaves',
  'team-attendance': 'attendance',
  'asset-management': 'asset-management',
  'policies-and-links': 'policies-and-links',
  teams: 'teams',
  'employee-profiles': 'employees',
  profile: 'profile',
};

function jumpAdminNav(nav: PortalNavId) {
  const section = ADMIN_NAV_MAP[nav] || nav;
  const btn = document.querySelector(`.sidebar-nav [data-nav="${section}"]`);
  if (btn instanceof HTMLElement) btn.click();
}

function PortalDashboardIsland() {
  const [user, setUser] = useState<EmployeeUser | null>(() => readEmployee());
  const [avatarOverride, setAvatarOverride] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | undefined>();

  useEffect(() => {
    const emp = readEmployee();
    if (!emp) return;
    api<{ profile: UserProfile }>('/api/users/me')
      .then((data) => {
        const p = data.profile;
        const merged: EmployeeUser = {
          ...emp,
          name: p.name,
          email: p.email,
          department: p.department ?? emp.department,
          designation: p.designation ?? emp.designation,
          reportingToId: p.reportingToId ?? emp.reportingToId ?? null,
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
      .catch(() => undefined);
  }, []);

  const onPasswordRequired = useCallback((msg?: string) => {
    setPasswordMessage(msg);
    const gate = document.getElementById('passwordChangeSection');
    if (gate) gate.classList.remove('hidden');
  }, []);

  if (!user) {
    return (
      <div className="dashboard-home-viewport" style={{ padding: 24 }}>
        <p className="stat-sub">Loading dashboard…</p>
      </div>
    );
  }

  return (
    <UserProvider value={{ user, setUser, avatarOverride, setAvatarOverride }}>
      {passwordMessage ? (
        <p className="stat-sub" style={{ padding: '0 0 12px', color: 'var(--warning)' }}>
          {passwordMessage}
        </p>
      ) : null}
      <DashboardHome user={user} onNavigate={jumpAdminNav} onPasswordRequired={onPasswordRequired} />
    </UserProvider>
  );
}

function resolveEl(target: HTMLElement | string) {
  return typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target;
}

function mountPortalDashboard(target: HTMLElement | string) {
  const el = resolveEl(target);
  if (!el || el.dataset.portalDashboardMounted === '1') return;
  const root = createRoot(el);
  roots.set(el, root);
  el.dataset.portalDashboardMounted = '1';
  root.render(<PortalDashboardIsland />);
}

if (!window.HRMS) {
  window.HRMS = { toast: () => {} };
}

window.HRMS.mountPortalDashboard = mountPortalDashboard;
