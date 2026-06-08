import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardHome } from '@/components/dashboard/DashboardHome';
import { PortalAppShell } from '@/components/layout/PortalAppShell';
import { PasswordGate } from '@/components/PasswordGate';
import { UserProvider } from '@/context/UserContext';
import { api, readEmployee } from '@/lib/api';
import {
  detectPortalRole,
  navSectionsForRole,
  PORTAL_PAGE_TITLES,
  type PortalNavId,
  type PortalRole,
} from '@/lib/portalNav';
import type { EmployeeUser, UserProfile } from '@/types/employee';
import { AttendancePanel } from '@/views/AttendancePanel';
import { AssetsPanel } from '@/views/AssetsPanel';
import { CalendarPanel } from '@/views/CalendarPanel';
import { HolidayCalendarPanel } from '@/views/HolidayCalendarPanel';
import { LeaveApplyPanel, LeaveHistoryPanel } from '@/views/LeavePanels';
import { LiveActivitiesPanel } from '@/views/LiveActivitiesPanel';
import { OrgTreePanel } from '@/features/team-hub/OrgTreePanel';
import { EmployeeProfilesPanel } from '@/views/EmployeeProfilesPanel';
import { LeaveApprovalPanel } from '@/views/LeaveApprovalPanel';
import { ManagerTeamAttendancePanel } from '@/views/ManagerTeamAttendancePanel';
import { PlaceholderPanel } from '@/views/PlaceholderPanel';
import { PoliciesPanel } from '@/views/PoliciesPanel';
import { ProfilePanel, SettingsPanel } from '@/views/ProfileSettingsPanels';

function renderPanel(
  nav: PortalNavId,
  user: EmployeeUser | null,
  setUser: (u: EmployeeUser) => void,
  onNavigate: (id: PortalNavId) => void,
  onPasswordRequired: (msg?: string) => void,
  portalRole: PortalRole
) {
  switch (nav) {
    case 'dashboard':
      return (
        <DashboardHome
          user={user}
          onNavigate={(id) => onNavigate(id as PortalNavId)}
          onPasswordRequired={onPasswordRequired}
        />
      );
    case 'profile':
      return (
        <div className="profile-viewport">
          <ProfilePanel user={user} onProfileSaved={(u) => setUser(u)} />
        </div>
      );
    case 'settings':
      return <SettingsPanel />;
    case 'asset-management':
      return <AssetsPanel />;
    case 'policies-and-links':
      return <PoliciesPanel />;
    case 'attendance':
      return <AttendancePanel />;
    case 'calendar':
      return (
        <div className="panel attendance-calendar-panel" style={{ padding: '14px 18px', overflow: 'hidden' }}>
          <CalendarPanel />
        </div>
      );
    case 'holiday-calendar':
      return (
        <div className="holiday-calendar-viewport">
          <HolidayCalendarPanel />
        </div>
      );
    case 'leave-apply':
      return <LeaveApplyPanel />;
    case 'leave-history':
      return <LeaveHistoryPanel />;
    case 'teams':
      return (
        <div className="org-teams-viewport">
          <OrgTreePanel />
        </div>
      );
    case 'employee-profiles':
      return (
        <div className="panel">
          <h2 className="panel-title">Employee profiles</h2>
          <p className="stat-sub" style={{ marginBottom: 16 }}>
            Browse colleague profiles and contact details. For reporting lines and hierarchy, open People → Organization chart.
          </p>
          <EmployeeProfilesPanel scope="all" />
        </div>
      );
    case 'live-activities':
      return <LiveActivitiesPanel portalRole={portalRole} mode="links" />;
    case 'nominations':
      return <LiveActivitiesPanel portalRole={portalRole} mode="nominations" />;
    case 'team-attendance':
      return <ManagerTeamAttendancePanel />;
    case 'leave-approval':
      return <LeaveApprovalPanel />;
    case 'reports':
      return <PlaceholderPanel title="Reports" />;
    case 'helpdesk':
      return (
        <div className="panel">
          <h2 className="panel-title">Helpdesk</h2>
          <p className="stat-sub" style={{ color: '#697279' }}>
            Coming soon — this module is not available yet.
          </p>
        </div>
      );
    default:
      return null;
  }
}

function dashboardPathForRole(role: string): string {
  const r = role.toLowerCase().trim();
  if (r === 'admin' || r === 'founder') return '/admin/dashboard';
  if (r === 'manager') return '/manager/dashboard';
  return '/employee/dashboard';
}

export default function App() {
  const portalRole: PortalRole = useMemo(() => detectPortalRole(), []);
  const navSections = useMemo(() => navSectionsForRole(portalRole), [portalRole]);

  const [nav, setNav] = useState<PortalNavId>('dashboard');
  const [user, setUser] = useState<EmployeeUser | null>(() => readEmployee());
  const [avatarOverride, setAvatarOverride] = useState<string | null>(null);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | undefined>();
  const [booting, setBooting] = useState(true);

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
    if (role === 'admin') {
      window.location.replace('/admin/dashboard');
      return;
    }

    const expectedPath = dashboardPathForRole(role);
    const currentPath = window.location.pathname.replace(/\/$/, '') || '/';
    if (currentPath !== expectedPath && !['/profile', '/account/profile'].includes(currentPath)) {
      window.location.replace(expectedPath);
      return;
    }

    if (portalRole === 'manager' && role !== 'manager') {
      window.location.replace('/employee/dashboard');
      return;
    }
    if (portalRole === 'employee' && role === 'manager') {
      window.location.replace('/manager/dashboard');
      return;
    }

    setUser(emp);
    if (emp.mustchangepassword) {
      setPasswordRequired(true);
    }
    setBooting(false);

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
      .catch(() => {});
  }, [portalRole]);

  const onPasswordRequired = useCallback((msg?: string) => {
    setPasswordRequired(true);
    setPasswordMessage(msg);
  }, []);

  if (booting || !user) {
    return (
      <div className="content-area" style={{ padding: 24 }}>
        <p className="stat-sub">Loading…</p>
      </div>
    );
  }

  const pageTitle = PORTAL_PAGE_TITLES[nav] || 'Dashboard';
  const portalLabel = portalRole === 'manager' ? 'Manager' : 'Employee';

  return (
    <UserProvider value={{ user, setUser, avatarOverride, setAvatarOverride }}>
      <PortalAppShell
        activeNav={nav}
        pageTitle={pageTitle}
        portalLabel={portalLabel}
        rolePill={portalLabel}
        sidebarRoleClass={portalRole === 'manager' ? 'manager' : 'employee'}
        navSections={navSections}
        onNavigate={setNav}
      >
        {passwordRequired && (
          <div style={{ marginBottom: 16 }}>
            <PasswordGate message={passwordMessage} />
          </div>
        )}
        {renderPanel(nav, user, setUser, setNav, onPasswordRequired, portalRole)}
      </PortalAppShell>
    </UserProvider>
  );
}
