/**
 * Mounts Team Hub panels into manager/admin HTML dashboards (vanilla shell).
 */
import { createRoot, type Root } from 'react-dom/client';
import { OrgChartPanel } from '@/features/team-hub/OrgChartPanel';
import { TaskManagerPanel } from '@/features/team-hub/TaskManagerPanel';
import { CalendarPanel } from '@/views/CalendarPanel';
import './index.css';

const roots = new WeakMap<HTMLElement, Root>();

function readStoredUserName() {
  try {
    const raw = localStorage.getItem('employee');
    if (!raw) return null;
    return (JSON.parse(raw) as { name?: string }).name ?? null;
  } catch {
    return null;
  }
}

function mount(el: HTMLElement, panel: 'org' | 'tasks' | 'calendar') {
  if (!el || el.dataset.teamHubMounted === '1') return;
  const root = createRoot(el);
  roots.set(el, root);
  el.dataset.teamHubMounted = '1';
  const userName = readStoredUserName();
  root.render(panel === 'org' ? <OrgChartPanel /> : panel === 'calendar' ? <CalendarPanel /> : <TaskManagerPanel userName={userName} />);
}

function remount(target: HTMLElement | string, panel: 'org' | 'tasks' | 'calendar') {
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

if (!window.HRMS) {
  window.HRMS = { toast: () => {} };
}
const hrms = window.HRMS;

hrms.mountTeamHubOrg = (target: HTMLElement | string) => {
  const el = resolveEl(target);
  if (el) mount(el, 'org');
};

hrms.mountTeamHubTasks = (target: HTMLElement | string) => {
  const el = resolveEl(target);
  if (el) mount(el, 'tasks');
};

hrms.mountAttendanceCalendar = (target: HTMLElement | string) => {
  const el = resolveEl(target);
  if (el) mount(el, 'calendar');
};

hrms.refreshTeamHubPanels = () => {
  remount('#teamHubOrgRoot', 'org');
  remount('#teamHubTeamsRoot', 'org');
};

hrms.initTeamHubPanels = () => {
  hrms.mountTeamHubOrg?.('#teamHubOrgRoot');
  hrms.mountTeamHubOrg?.('#teamHubTeamsRoot');
  hrms.mountTeamHubTasks?.('#teamHubTasksRoot');
  hrms.mountAttendanceCalendar?.('#adminCalendarRoot');
  hrms.mountAttendanceCalendar?.('#managerCalendarRoot');
};
