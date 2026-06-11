/**
 * Mounts React panels into the admin HTML dashboard (vanilla shell).
 * Each mount targets one section only — org chart is limited to Teams.
 */
import { useMemo, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { OrgTreePanel } from '@/features/team-hub/OrgTreePanel';
import SocialPortal from '@/SocialPortal.jsx';
import { CalendarPanel } from '@/views/CalendarPanel';
import { HolidayCalendarPanel } from '@/views/HolidayCalendarPanel';
import { ProfilePanel } from '@/views/ProfileSettingsPanels';
import { UserProvider } from '@/context/UserContext';
import { readEmployee } from '@/lib/api';
import type { EmployeeUser } from '@/types/employee';
import './index.css';
import './portal-dashboard-entry';

const roots = new WeakMap<HTMLElement, Root>();

type TeamHubPanel = 'org-tree' | 'calendar' | 'holiday';

function mount(el: HTMLElement, panel: TeamHubPanel) {
  if (!el || el.dataset.teamHubMounted === '1') return;
  const root = createRoot(el);
  roots.set(el, root);
  el.dataset.teamHubMounted = '1';
  const content =
    panel === 'org-tree' ? (
      <OrgTreePanel />
    ) : panel === 'calendar' ? (
      <CalendarPanel />
    ) : (
      <div className="holiday-calendar-viewport">
        <HolidayCalendarPanel />
      </div>
    );
  root.render(content);
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
      <ProfilePanel
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

type TeamHubHrms = typeof window.HRMS & {
  mountTeamHubOrgTree?: (target: HTMLElement | string) => void;
  mountSocialPortal?: (target: HTMLElement | string) => void;
  mountAdminProfile?: (target: HTMLElement | string) => void;
};

if (!window.HRMS) {
  window.HRMS = { toast: () => {} };
}
const hrms = window.HRMS as TeamHubHrms;

hrms.mountTeamHubOrgTree = (target: HTMLElement | string) => {
  const el = resolveEl(target);
  if (el) mount(el, 'org-tree');
};

hrms.mountAttendanceCalendar = (target: HTMLElement | string) => {
  const el = resolveEl(target);
  if (el) mount(el, 'calendar');
};

hrms.mountHolidayCalendar = (target: HTMLElement | string) => {
  const el = resolveEl(target);
  if (el) mount(el, 'holiday');
};

hrms.mountSocialPortal = (target: HTMLElement | string) => {
  const el = resolveEl(target);
  if (!el || el.dataset.socialMounted === '1') return;
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
};

hrms.mountAdminProfile = (target: HTMLElement | string) => {
  const el = resolveEl(target);
  if (!el || el.dataset.profileMounted === '1') return;
  const root = createRoot(el);
  roots.set(el, root);
  el.dataset.profileMounted = '1';
  root.render(<AdminProfileMount />);
};

/** Refresh org chart only when the Teams section is visible. */
hrms.refreshTeamHubPanels = () => {
  if (!isTeamsViewActive()) return;
  remount('#teamHubOrgTreeRoot', 'org-tree');
};
