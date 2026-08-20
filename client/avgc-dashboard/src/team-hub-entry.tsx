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

type TeamHubPanel = 'org-tree' | 'calendar' | 'holiday' | 'employee-directory';

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

async function loadEmployeeDirectoryPanel() {
  const { EmployeeDirectoryPanel } = await import('@/views/EmployeeDirectoryPanel');
  return EmployeeDirectoryPanel;
}

function mount(el: HTMLElement, panel: TeamHubPanel) {
  if (!el || el.dataset.teamHubMounted === '1') return;
  const root = createRoot(el);
  roots.set(el, root);
  el.dataset.teamHubMounted = '1';

  void (async () => {
    try {
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
      } else if (panel === 'employee-directory') {
        const EmployeeDirectoryPanel = await loadEmployeeDirectoryPanel();
        content = (
          <div className="employee-directory-viewport">
            <EmployeeDirectoryPanel />
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
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not load this module';
      root.render(
        <div className="panel" style={{ margin: 24 }}>
          <h2 className="panel-title">Module failed to load</h2>
          <p className="stat-sub">
            {message}. On AWS, run <code>npm run build:dashboard</code> and deploy the full{' '}
            <code>public/assets/avgc-dashboard/</code> folder (including <code>chunks/</code>).
          </p>
        </div>
      );
    }
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

function mountLazyAdminPanel(
  target: HTMLElement | string,
  mountedKey: string,
  label: string,
  loadPanel: () => Promise<ComponentType>
) {
  const el = resolveEl(target);
  if (!el || el.dataset[mountedKey] === '1') return;

  const root = createRoot(el);
  roots.set(el, root);
  root.render(<p className="stat-sub">Loading {label}…</p>);

  void loadPanel()
    .then((result) => {
      const Panel =
        typeof result === 'function'
          ? result
          : (result as { default?: ComponentType; AdminEfficiencyPanel?: ComponentType }).default ??
            (result as { AdminEfficiencyPanel?: ComponentType }).AdminEfficiencyPanel;
      if (typeof Panel !== 'function') {
        throw new Error('Panel module did not export a component');
      }
      if (el.dataset[mountedKey] === '1') return;
      el.dataset[mountedKey] = '1';
      root.render(<Panel />);
    })
    .catch((err) => {
      delete el.dataset[mountedKey];
      const message = err instanceof Error ? err.message : 'Could not load this module';
      root.render(
        <div className="panel" style={{ margin: 24 }}>
          <h2 className="panel-title">{label} failed to load</h2>
          <p className="stat-sub">
            {message}. Hard-refresh the page (Ctrl+Shift+R). If it persists, run{' '}
            <code>npm run build:dashboard</code> and redeploy{' '}
            <code>public/assets/avgc-dashboard/</code> (including <code>chunks/</code>).
          </p>
        </div>
      );
    });
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

function LazySettingsPanel() {
  const [Panel, setPanel] = useState<ComponentType | null>(null);

  useEffect(() => {
    void import('@/views/ProfileSettingsPanels').then((m) => setPanel(() => m.SettingsPanel));
  }, []);

  if (!Panel) return <p className="stat-sub">Loading settings…</p>;
  return <Panel />;
}

function LazyExitPanel() {
  const [Panel, setPanel] = useState<ComponentType | null>(null);

  useEffect(() => {
    void import('@/views/ExitPanel').then((m) => setPanel(() => m.ExitPanel));
  }, []);

  if (!Panel) return <p className="stat-sub">Loading exit portal…</p>;
  return <Panel />;
}

type TeamHubHrms = typeof window.HRMS & {
  mountTeamHubOrgTree?: (target: HTMLElement | string) => void;
  mountSocialPortal?: (target: HTMLElement | string) => void;
  mountAdminProfile?: (target: HTMLElement | string) => void;
  mountAdminSettings?: (target: HTMLElement | string) => void;
  mountAdminMyExit?: (target: HTMLElement | string) => void;
  mountLeaveApply?: (target: HTMLElement | string) => void;
  mountAdminExitClearances?: (target: HTMLElement | string) => void;
  mountAdminOnboarding?: (target: HTMLElement | string) => void;
  mountAdminPerformance?: (target: HTMLElement | string) => void;
  mountAdminEfficiency?: (target: HTMLElement | string) => void;
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

hrms.mountEmployeeDirectory = (target: HTMLElement | string) => {
  remount(target, 'employee-directory');
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

hrms.mountAdminSettings = (target: HTMLElement | string) => {
  const el = resolveEl(target);
  if (!el || el.dataset.settingsMounted === '1') return;
  const root = createRoot(el);
  roots.set(el, root);
  el.dataset.settingsMounted = '1';
  root.render(<LazySettingsPanel />);
};

hrms.mountAdminMyExit = (target: HTMLElement | string) => {
  const el = resolveEl(target);
  if (!el || el.dataset.myExitMounted === '1') return;
  const root = createRoot(el);
  roots.set(el, root);
  el.dataset.myExitMounted = '1';
  root.render(<LazyExitPanel />);
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
  mountLazyAdminPanel(
    target,
    'exitClearancesMounted',
    'Exit clearances',
    () => import('@/views/AdminExitClearancesPanel').then((m) => m.AdminExitClearancesPanel)
  );
};

hrms.mountAdminOnboarding = (target: HTMLElement | string) => {
  mountLazyAdminPanel(
    target,
    'adminOnboardingMounted',
    'Onboarding',
    () => import('@/views/AdminOnboardingPanel').then((m) => m.AdminOnboardingPanel)
  );
};

hrms.mountAdminPerformance = (target: HTMLElement | string) => {
  mountLazyAdminPanel(
    target,
    'adminPerformanceMounted',
    'Performance',
    () => import('@/views/AdminPerformancePanel').then((m) => m.AdminPerformancePanel)
  );
};

hrms.mountAdminEfficiency = (target: HTMLElement | string) => {
  mountLazyAdminPanel(
    target,
    'adminEfficiencyMounted',
    'Efficiency tracking',
    () => import('@/views/AdminEfficiencyPanel').then((m) => m.AdminEfficiencyPanel)
  );
};

hrms.mountPortalDashboard = (target: HTMLElement | string) => {
  void import('./portal-dashboard-entry').then((m) => m.mountPortalDashboard(target));
};

hrms.refreshTeamHubPanels = () => {
  if (document.querySelector('#teamHubOrgTreeRoot')) {
    remount('#teamHubOrgTreeRoot', 'org-tree');
  }
};

schedulePolicyChatbot();
