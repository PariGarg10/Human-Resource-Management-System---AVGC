/**
 * Mounts React panels into the admin HTML dashboard (vanilla shell).
 * Heavy panels load on demand when their section is opened.
 */
import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { UserProvider } from '@/context/UserContext';
import { readEmployee } from '@/lib/api';
import type { EmployeeUser } from '@/types/employee';
import { schedulePolicyChatbot } from '@/lib/schedulePolicyChatbot';
import './index.css';

const roots = new WeakMap<HTMLElement, Root>();

type TeamHubPanel = 'org-tree' | 'calendar' | 'holiday';

async function loadOrgTreePanel() {
  const { OrgTreePanel } = await import('@/features/team-hub/OrgTreePanel');
  return OrgTreePanel;
}

async function loadCalendarPanel() {
  const { CalendarPanel } = await import('@/views/CalendarPanel');
  return CalendarPanel;
}

async function loadHolidayCalendarPanel() {
  const { HolidayCalendarPanel } = await import('@/views/HolidayCalendarPanel');
  return HolidayCalendarPanel;
}

function mount(el: HTMLElement, panel: TeamHubPanel) {
  if (!el || el.dataset.teamHubMounted === '1') return;
  const root = createRoot(el);
  roots.set(el, root);
  el.dataset.teamHubMounted = '1';

  void (async () => {
    let content;
    if (panel === 'org-tree') {
      const OrgTreePanel = await loadOrgTreePanel();
      content = <OrgTreePanel />;
    } else if (panel === 'calendar') {
      const CalendarPanel = await loadCalendarPanel();
      content = (
        <div className="panel attendance-calendar-panel attendance-calendar-mount-inner">
          <CalendarPanel />
        </div>
      );
    } else {
      const HolidayCalendarPanel = await loadHolidayCalendarPanel();
      content = (
        <div className="holiday-calendar-viewport">
          <HolidayCalendarPanel />
        </div>
      );
    }
    root.render(content);
  })();
}

function remount(target: HTMLElement | string, panel: TeamHubPanel) {
  const el = resolveEl(target);
  if (!el) return;
  const existing = roots.get(el);
  if (existing) existing.unmount();
  roots.delete(el);
  delete el.dataset.teamHubMounted;
  mount(el, panel);
}

function resolveEl(target: HTMLElement | string) {
  return typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target;
}

function isTeamsViewActive() {
  return document.getElementById('view-teams')?.classList.contains('is-active') ?? false;
}

function AdminProfileMount() {
  const [user, setUser] = useState<EmployeeUser | null>(() => readEmployee());
  const [avatarOverride, setAvatarOverride] = useState<string | null>(null);
  const value = useMemo(
    () => ({ user, setUser, avatarOverride, setAvatarOverride }),
    [user, avatarOverride]
  );
  return (
    <UserProvider value={value}>
      <LazyProfilePanel
        user={user}
        onProfileSaved={(u) => {
          setUser(u);
          const hrms = window.HRMS as typeof window.HRMS & {
            updateAvatarEverywhere?: (url: string, name?: string) => void;
            syncNavProfileName?: (name: string, email: string) => void;
          };
          if (u.profilePhotoUrl) hrms.updateAvatarEverywhere?.(u.profilePhotoUrl, u.name);
          hrms.syncNavProfileName?.(u.name || '', u.email || '');
          const sidebarUserName = document.getElementById('sidebarUserName');
          if (sidebarUserName) sidebarUserName.textContent = u.name || 'Admin';
        }}
      />
    </UserProvider>
  );
}

function LazyProfilePanel(props: {
  user: EmployeeUser | null;
  onProfileSaved: (u: EmployeeUser) => void;
}) {
  const [Panel, setPanel] = useState<ComponentType<{
    user: EmployeeUser | null;
    onProfileSaved: (u: EmployeeUser) => void;
  }> | null>(null);

  useEffect(() => {
    void import('@/views/ProfileSettingsPanels').then((m) => setPanel(() => m.ProfilePanel));
  }, []);

  if (!Panel) {
    return <p className="stat-sub">Loading profile…</p>;
  }
  return <Panel user={props.user} onProfileSaved={props.onProfileSaved} />;
}

function AdminLeaveApplyMount() {
  const [user, setUser] = useState<EmployeeUser | null>(() => readEmployee());
  const [avatarOverride, setAvatarOverride] = useState<string | null>(null);
  const value = useMemo(
    () => ({ user, setUser, avatarOverride, setAvatarOverride }),
    [user, avatarOverride]
  );
  return (
    <UserProvider value={value}>
      <LazyLeaveApplyPanel />
    </UserProvider>
  );
}

function LazyLeaveApplyPanel() {
  const [Panel, setPanel] = useState<ComponentType | null>(null);

  useEffect(() => {
    void import('@/views/LeavePanels').then((m) => setPanel(() => m.LeaveApplyPanel));
  }, []);

  if (!Panel) return <p className="stat-sub">Loading…</p>;
  return <Panel />;
}

type TeamHubHrms = typeof window.HRMS & {
  mountTeamHubOrgTree?: (target: HTMLElement | string) => void;
  mountSocialPortal?: (target: HTMLElement | string) => void;
  mountAdminProfile?: (target: HTMLElement | string) => void;
  mountLeaveApply?: (target: HTMLElement | string) => void;
  mountAdminExitClearances?: (target: HTMLElement | string) => void;
  mountAdminOnboarding?: (target: HTMLElement | string) => void;
  mountAdminPerformance?: (target: HTMLElement | string) => void;
  mountPortalDashboard?: (target: HTMLElement | string) => void;
};

if (!window.HRMS) {
  window.HRMS = { toast: () => {} };
}
const hrms = window.HRMS as TeamHubHrms;

hrms.mountTeamHubOrgTree = (target: HTMLElement | string) => {
  remount(target, 'org-tree');
};

hrms.mountAttendanceCalendar = (target: HTMLElement | string) => {
  remount(target, 'calendar');
};

hrms.mountHolidayCalendar = (target: HTMLElement | string) => {
  remount(target, 'holiday');
};

hrms.mountSocialPortal = (target: HTMLElement | string) => {
  const el = resolveEl(target);
  if (!el || el.dataset.socialMounted === '1') return;
  void import('@/SocialPortal.jsx').then(({ default: SocialPortal }) => {
    if (el.dataset.socialMounted === '1') return;
    let userName = 'Admin';
    try {
      const stored = JSON.parse(localStorage.getItem('employee') || '{}') as { name?: string };
      userName = stored.name || 'Admin';
    } catch {
      /* use default */
    }
    const root = createRoot(el);
    roots.set(el, root);
    el.dataset.socialMounted = '1';
    root.render(<SocialPortal currentUserName={userName} isAdminUser />);
  });
};

hrms.mountAdminProfile = (target: HTMLElement | string) => {
  const el = resolveEl(target);
  if (!el || el.dataset.profileMounted === '1') return;
  const root = createRoot(el);
  roots.set(el, root);
  el.dataset.profileMounted = '1';
  root.render(<AdminProfileMount />);
};

hrms.mountLeaveApply = (target: HTMLElement | string) => {
  const el = resolveEl(target);
  if (!el || el.dataset.leaveApplyMounted === '1') return;
  const root = createRoot(el);
  roots.set(el, root);
  el.dataset.leaveApplyMounted = '1';
  root.render(<AdminLeaveApplyMount />);
};

hrms.mountAdminExitClearances = (target: HTMLElement | string) => {
  const el = resolveEl(target);
  if (!el || el.dataset.exitClearancesMounted === '1') return;
  void import('@/views/AdminExitClearancesPanel').then(({ AdminExitClearancesPanel }) => {
    if (el.dataset.exitClearancesMounted === '1') return;
    const root = createRoot(el);
    roots.set(el, root);
    el.dataset.exitClearancesMounted = '1';
    root.render(<AdminExitClearancesPanel />);
  });
};

hrms.mountAdminOnboarding = (target: HTMLElement | string) => {
  const el = resolveEl(target);
  if (!el || el.dataset.adminOnboardingMounted === '1') return;
  void import('@/views/AdminOnboardingPanel').then(({ AdminOnboardingPanel }) => {
    if (el.dataset.adminOnboardingMounted === '1') return;
    const root = createRoot(el);
    roots.set(el, root);
    el.dataset.adminOnboardingMounted = '1';
    root.render(<AdminOnboardingPanel />);
  });
};

hrms.mountAdminPerformance = (target: HTMLElement | string) => {
  const el = resolveEl(target);
  if (!el || el.dataset.adminPerformanceMounted === '1') return;
  void import('@/views/AdminPerformancePanel').then(({ AdminPerformancePanel }) => {
    if (el.dataset.adminPerformanceMounted === '1') return;
    const root = createRoot(el);
    roots.set(el, root);
    el.dataset.adminPerformanceMounted = '1';
    root.render(<AdminPerformancePanel />);
  });
};

hrms.mountPortalDashboard = (target: HTMLElement | string) => {
  void import('./portal-dashboard-entry').then((m) => m.mountPortalDashboard(target));
};

hrms.refreshTeamHubPanels = () => {
  if (!isTeamsViewActive()) return;
  remount('#teamHubOrgTreeRoot', 'org-tree');
};

schedulePolicyChatbot();
