/**
 * Mounts React panels into the admin HTML dashboard (vanilla shell).
 * Each mount targets one section only — org chart is limited to Teams.
 */
import { createRoot, type Root } from 'react-dom/client';
import { OrgTreePanel } from '@/features/team-hub/OrgTreePanel';
import { CalendarPanel } from '@/views/CalendarPanel';
import { HolidayCalendarPanel } from '@/views/HolidayCalendarPanel';
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

type TeamHubHrms = typeof window.HRMS & {
  mountTeamHubOrgTree?: (target: HTMLElement | string) => void;
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

/** Refresh org chart only when the Teams section is visible. */
hrms.refreshTeamHubPanels = () => {
  if (!isTeamsViewActive()) return;
  remount('#teamHubOrgTreeRoot', 'org-tree');
};
