/**
 * Mounts the shared employee/manager dashboard home into admin HTML shell.
 */
import { useCallback, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DashboardHome } from '@/components/dashboard/DashboardHome';
import { syncPortalUserIdentityDom } from '@/components/PortalUserIdentity';
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
  'leave-apply': 'leave-apply',
  'leave-history': 'leaves',
  'leave-approval': 'leaves',
  'team-attendance': 'attendance',
  'asset-management': 'asset-management',
  'policies-and-links': 'policies-and-links',
  teams: 'teams',
  'employee-directory': 'employee-directory',
  profile: 'profile',
  'live-activities': 'live-activity-links',
  'social-portal': 'company-social',
  helpdesk: 'dashboard',
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
    Promise.all([
      api<{ profile: UserProfile }>('/api/users/me'),
      api<{ record?: { punchin?: string | null; punchout?: string | null } | null }>('/api/attendance/today'),
    ])
      .then(([profileRes, att]) => {
        const p = profileRes.profile;
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
        const formatPunch = (value: string | null | undefined) => {
          if (!value) return '—';
          const d = new Date(value);
          if (Number.isNaN(d.getTime())) return '—';
          return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        };
        syncPortalUserIdentityDom(
          merged,
          formatPunch(att.record?.punchin),
          formatPunch(att.record?.punchout)
        );
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

export { mountPortalDashboard };
