import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DashboardHome } from '@/components/dashboard/DashboardHome';
import { FirstLoginCelebration } from '@/components/FirstLoginCelebration';
import { OnboardingCompleteCelebration } from '@/components/OnboardingCompleteCelebration';
import { PortalAppShell } from '@/components/layout/PortalAppShell';
import { PasswordGate } from '@/components/PasswordGate';
import { UserProvider } from '@/context/UserContext';
import { api, readEmployee } from '@/lib/api';
import {
  detectPortalRole,
  isOnboardingNavAllowed,
  navSectionsForRole,
  ONBOARDING_GATE_NAV_SECTIONS,
  PORTAL_PAGE_TITLES,
  profileMenuItemsForContext,
  type PortalNavId,
  type PortalRole,
} from '@/lib/portalNav';
import type { EmployeeUser, UserProfile } from '@/types/employee';
import {
  AssetsPanel,
  AttendancePanel,
  CalendarPanel,
  ExitPanel,
  HolidayCalendarPanel,
  LazyPanel,
  LeaveApplyPanel,
  LeaveApprovalPanel,
  LeaveHistoryPanel,
  LiveActivitiesPanel,
  ManagerExitClearancesPanel,
  ManagerTeamAttendancePanel,
  OnboardingPanel,
  OrgTreePanel,
  EmployeeDirectoryPanel,
  PerformancePanel,
  PlaceholderPanel,
  PoliciesPanel,
  ProfilePanel,
  SettingsPanel,
  SocialPortal,
} from '@/lib/lazyPanels';

function renderPanel(
  nav: PortalNavId,
  user: EmployeeUser | null,
  setUser: (u: EmployeeUser) => void,
  onNavigate: (id: PortalNavId) => void,
  onPasswordRequired: (msg?: string) => void,
  portalRole: PortalRole,
  onOnboardingCompleted?: (options?: { celebrate?: boolean }) => void
) {
  switch (nav) {
    case 'dashboard':
      return (
        <DashboardHome
          user={user}
          portalRole={portalRole}
          onNavigate={(id) => onNavigate(id as PortalNavId)}
          onPasswordRequired={onPasswordRequired}
        />
      );
    case 'profile':
      return (
        <LazyPanel>
          <div className="profile-viewport">
            <ProfilePanel user={user} onProfileSaved={(u) => setUser(u)} />
          </div>
        </LazyPanel>
      );
    case 'settings':
      return (
        <LazyPanel>
          <SettingsPanel />
        </LazyPanel>
      );
    case 'asset-management':
      return (
        <LazyPanel>
          <AssetsPanel />
        </LazyPanel>
      );
    case 'policies-and-links':
      return (
        <LazyPanel>
          <PoliciesPanel />
        </LazyPanel>
      );
    case 'attendance':
      return (
        <LazyPanel>
          <AttendancePanel />
        </LazyPanel>
      );
    case 'calendar':
      return (
        <LazyPanel>
          <div className="panel attendance-calendar-panel" style={{ padding: '14px 18px', overflow: 'hidden' }}>
            <CalendarPanel />
          </div>
        </LazyPanel>
      );
    case 'holiday-calendar':
      return (
        <LazyPanel>
          <div className="holiday-calendar-viewport">
            <HolidayCalendarPanel />
          </div>
        </LazyPanel>
      );
    case 'leave-apply':
      return (
        <LazyPanel>
          <LeaveApplyPanel />
        </LazyPanel>
      );
    case 'leave-history':
      return (
        <LazyPanel>
          <LeaveHistoryPanel />
        </LazyPanel>
      );
    case 'teams':
      return (
        <LazyPanel>
          <div className="org-teams-viewport">
            <OrgTreePanel />
          </div>
        </LazyPanel>
      );
    case 'employee-directory':
      return (
        <LazyPanel>
          <div className="employee-directory-viewport">
            <EmployeeDirectoryPanel />
          </div>
        </LazyPanel>
      );
    case 'live-activities':
      return (
        <LazyPanel>
          <LiveActivitiesPanel portalRole={portalRole} mode="links" />
        </LazyPanel>
      );
    case 'team-attendance':
      return (
        <LazyPanel>
          <ManagerTeamAttendancePanel />
        </LazyPanel>
      );
    case 'leave-approval':
      return (
        <LazyPanel>
          <LeaveApprovalPanel />
        </LazyPanel>
      );
    case 'reports':
      return (
        <LazyPanel>
          <PlaceholderPanel title="Reports" />
        </LazyPanel>
      );
    case 'helpdesk':
      return (
        <div className="panel">
          <h2 className="panel-title">Helpdesk</h2>
          <p className="stat-sub" style={{ color: '#697279' }}>
            Coming soon — this module is not available yet.
          </p>
        </div>
      );
    case 'social-portal':
      return (
        <LazyPanel>
          <div className="social-portal-viewport" style={{ margin: '-14px -18px', minHeight: 'calc(100vh - 120px)' }}>
            <SocialPortal currentUserName={user?.name || 'You'} isAdminUser={false} />
          </div>
        </LazyPanel>
      );
    case 'onboarding':
      return (
        <LazyPanel>
          <OnboardingPanel
            user={user}
            onNavigate={onNavigate}
            onOnboardingCompleted={onOnboardingCompleted}
          />
        </LazyPanel>
      );
    case 'exit':
      return (
        <LazyPanel>
          <ExitPanel />
        </LazyPanel>
      );
    case 'exit-clearances':
      return (
        <LazyPanel>
          <ManagerExitClearancesPanel />
        </LazyPanel>
      );
    case 'performance':
      return (
        <LazyPanel>
          <PerformancePanel portalRole={portalRole} />
        </LazyPanel>
      );
    case 'performance-team':
      return (
        <LazyPanel>
          <PerformancePanel portalRole="manager" initialTab="team" />
        </LazyPanel>
      );
    default:
      return null;
  }
}

function readNavFromLocation(): PortalNavId | null {
  const hash = String(window.location.hash || '').replace(/^#/, '').trim();
  return hash ? (hash as PortalNavId) : null;
}

function dashboardPathForRole(role: string): string {
  const r = role.toLowerCase().trim();
  if (r === 'admin' || r === 'founder') return '/admin/dashboard';
  if (r === 'manager') return '/manager/dashboard';
  return '/employee/dashboard';
}

export default function App() {
  const portalRole: PortalRole = useMemo(() => detectPortalRole(), []);
  const [onboardingIncomplete, setOnboardingIncomplete] = useState(() => {
    const emp = readEmployee();
    const role = detectPortalRole();
    return Boolean(emp && role === 'employee' && emp.onboardingCompleted !== true);
  });

  const onboardingGated = onboardingIncomplete && portalRole === 'employee';

  const navSections = useMemo(() => {
    if (onboardingGated) return ONBOARDING_GATE_NAV_SECTIONS;

    let base = navSectionsForRole(portalRole);
    return base;
  }, [portalRole, onboardingGated]);

  const [nav, setNav] = useState<PortalNavId>(() => {
    const fromHash = readNavFromLocation();
    if (fromHash) return fromHash;
    const emp = readEmployee();
    const role = detectPortalRole();
    if (emp && role === 'employee' && emp.onboardingCompleted !== true) {
      return 'onboarding';
    }
    return 'dashboard';
  });
  const [user, setUser] = useState<EmployeeUser | null>(() => readEmployee());
  const [avatarOverride, setAvatarOverride] = useState<string | null>(null);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | undefined>();
  const [booting, setBooting] = useState(true);
  const [showFirstLogin, setShowFirstLogin] = useState(false);
  const [showOnboardingCelebrate, setShowOnboardingCelebrate] = useState(false);
  const [portalUnlocking, setPortalUnlocking] = useState(false);
  const navFromHistoryRef = useRef(false);

  const applyPortalNav = useCallback(
    (id: PortalNavId, options?: { skipHistory?: boolean }) => {
      let next = id;
      if (onboardingGated && !isOnboardingNavAllowed(next)) {
        next = 'onboarding';
      }
      if (next === 'social-portal') {
        (window as { HRMS?: { fireConfettiBurst?: (o?: { x: number; y: number }) => void } }).HRMS?.fireConfettiBurst?.();
      }
      setNav(next);
      if (!options?.skipHistory && !navFromHistoryRef.current) {
        try {
          sessionStorage.setItem('hrms-last-nav-section', next);
        } catch {
          /* ignore */
        }
        const nextUrl = `${window.location.pathname}${window.location.search}#${next}`;
        if (window.location.hash !== `#${next}`) {
          window.history.pushState({ hrmsNav: next }, '', nextUrl);
        }
      }
    },
    [onboardingGated]
  );

  const finishOnboardingUnlock = useCallback(() => {
    setOnboardingIncomplete(false);
    setUser((prev) => {
      const next = prev ? { ...prev, onboardingCompleted: true } : prev;
      if (next) localStorage.setItem('employee', JSON.stringify(next));
      return next;
    });
    window.dispatchEvent(new CustomEvent('hrms:employee-updated'));
    setShowOnboardingCelebrate(false);
    setPortalUnlocking(true);
    setNav('dashboard');
    try {
      sessionStorage.setItem('hrms-last-nav-section', 'dashboard');
    } catch {
      /* ignore */
    }
    const nextUrl = `${window.location.pathname}${window.location.search}#dashboard`;
    window.history.replaceState({ hrmsNav: 'dashboard' }, '', nextUrl);
    window.setTimeout(() => setPortalUnlocking(false), 900);
  }, []);

  const handleOnboardingCompleted = useCallback(
    (options?: { celebrate?: boolean }) => {
      if (options?.celebrate) {
        setShowOnboardingCelebrate((open) => open || true);
        return;
      }
      finishOnboardingUnlock();
    },
    [finishOnboardingUnlock]
  );

  const navigatePortal = useCallback(
    (id: PortalNavId) => {
      applyPortalNav(id);
    },
    [applyPortalNav]
  );

  useEffect(() => {
    const onPopState = () => {
      const section = (window.history.state?.hrmsNav ||
        String(window.location.hash || '').replace(/^#/, '').trim() ||
        'dashboard') as PortalNavId;
      navFromHistoryRef.current = true;
      applyPortalNav(section, { skipHistory: true });
      navFromHistoryRef.current = false;
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [applyPortalNav]);

  useEffect(() => {
    const onPortalNav = (event: Event) => {
      const detail = (event as CustomEvent<{ nav?: string }>).detail;
      const target = detail?.nav as PortalNavId | undefined;
      if (target) navigatePortal(target);
    };
    window.addEventListener('hrms:portal-nav', onPortalNav);
    return () => window.removeEventListener('hrms:portal-nav', onPortalNav);
  }, [navigatePortal]);

  useEffect(() => {
    if (!onboardingGated) return;
    if (!isOnboardingNavAllowed(nav)) {
      setNav('onboarding');
    }
  }, [onboardingGated, nav]);

  useEffect(() => {
    const path = window.location.pathname.replace(/\/$/, '') || '/';
    if (path === '/profile' || path === '/account/profile') {
      setNav('profile');
    }
    if (path === '/employee/onboarding') {
      setNav('onboarding');
    }
    if (path === '/employee/exit') {
      setNav('exit');
    }
    if (path === '/manager/exit-clearances') {
      setNav('exit-clearances');
    }
    if (path === '/manager/exit') {
      setNav('exit');
    }

    const hashNav = readNavFromLocation();
    if (hashNav) {
      setNav(hashNav);
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
    const allowedExtraPaths =
      portalRole === 'manager'
        ? ['/profile', '/account/profile', '/manager/exit-clearances', '/manager/exit']
        : ['/profile', '/account/profile', '/employee/onboarding', '/employee/exit'];
    if (currentPath !== expectedPath && !allowedExtraPaths.includes(currentPath)) {
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
    if (emp.isFirstLogin === true && portalRole === 'employee' && !emp.mustchangepassword) {
      setShowFirstLogin(true);
    }
    setBooting(false);

    const initialNav =
      hashNav ||
      (path === '/profile' || path === '/account/profile'
        ? 'profile'
        : path === '/employee/onboarding'
          ? 'onboarding'
          : path === '/employee/exit'
            ? 'exit'
            : path === '/manager/exit'
              ? 'exit'
            : path === '/manager/exit-clearances'
              ? 'exit-clearances'
              : emp.mustchangepassword && portalRole === 'employee'
                ? 'onboarding'
                : portalRole === 'employee' && emp.onboardingCompleted !== true
                  ? 'onboarding'
                  : 'dashboard');
    window.history.replaceState(
      { hrmsNav: initialNav },
      '',
      `${window.location.pathname}${window.location.search}#${initialNav}`
    );
    try {
      sessionStorage.setItem('hrms-last-nav-section', initialNav);
    } catch {
      /* ignore */
    }

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
          dateOfJoining: p.dateOfJoining,
          phone: p.phone,
          location: p.location,
          bio: p.bio,
          profilePhotoUrl: p.profilePhotoUrl,
          age: p.age,
          isFirstLogin: p.isFirstLogin === true,
          onboardingCompleted: p.onboardingCompleted === true,
          mustchangepassword: emp.mustchangepassword,
        };
        localStorage.setItem('employee', JSON.stringify(merged));
        setUser(merged);
        if (portalRole === 'employee') {
          const incomplete = p.onboardingCompleted !== true;
          setOnboardingIncomplete(incomplete);
          if (incomplete && !emp.mustchangepassword) {
            setNav((current) => (isOnboardingNavAllowed(current) ? current : 'onboarding'));
          }
        }
        if (p.isFirstLogin === true && portalRole === 'employee' && !emp.mustchangepassword) {
          setShowFirstLogin(true);
        }
      })
      .catch(() => {});

    api<{ force_password_change?: boolean }>('/api/auth/me')
      .then((authMe) => {
        if (authMe.force_password_change) {
          setPasswordRequired(true);
          setNav('onboarding');
        }
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
  const firstName = (user.name || 'there').trim().split(/\s+/)[0] || 'there';
  const passwordBlocking = passwordRequired && portalRole === 'employee';

  return (
    <UserProvider value={{ user, setUser, avatarOverride, setAvatarOverride }}>
      {showFirstLogin && user.id && portalRole === 'employee' && !passwordRequired ? (
        <FirstLoginCelebration
          userId={user.id}
          firstName={firstName}
          onboardingGated={onboardingGated}
          onClose={() => {
            setShowFirstLogin(false);
            setUser((prev) => (prev ? { ...prev, isFirstLogin: false } : prev));
          }}
          onNavigate={navigatePortal}
        />
      ) : null}
      {showOnboardingCelebrate ? (
        <OnboardingCompleteCelebration
          firstName={firstName}
          onEnterPortal={finishOnboardingUnlock}
        />
      ) : null}
      <PortalAppShell
        activeNav={nav}
        pageTitle={pageTitle}
        portalLabel={portalLabel}
        rolePill={portalLabel}
        sidebarRoleClass={portalRole === 'manager' ? 'manager' : 'employee'}
        navSections={navSections}
        profileMenuItems={profileMenuItemsForContext({ onboardingGated })}
        onNavigate={navigatePortal}
      >
        {passwordBlocking ? (
          <div className="onboarding-password-only">
            <PasswordGate onboarding message={passwordMessage} />
          </div>
        ) : (
          <>
            {onboardingGated && !showOnboardingCelebrate && (
              <div className="onboarding-gate-banner" role="status">
                <strong>Almost there!</strong> Finish every task below to unlock your full portal — dashboard, leave,
                attendance, and more.
              </div>
            )}
            <div
              className={[
                'portal-view-root',
                nav === 'teams' ? 'portal-view-root--teams' : '',
                nav === 'calendar' ? 'portal-view-root--calendar' : '',
                nav === 'holiday-calendar' ? 'portal-view-root--holiday' : '',
                nav === 'employee-directory' ? 'portal-view-root--directory' : '',
                portalUnlocking ? 'portal-content--unlocking' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {renderPanel(
                nav,
                user,
                (u) => {
                  setUser(u);
                  if (u.onboardingCompleted) handleOnboardingCompleted({ celebrate: true });
                },
                navigatePortal,
                onPasswordRequired,
                portalRole,
                handleOnboardingCompleted
              )}
            </div>
          </>
        )}
      </PortalAppShell>
    </UserProvider>
  );
}
