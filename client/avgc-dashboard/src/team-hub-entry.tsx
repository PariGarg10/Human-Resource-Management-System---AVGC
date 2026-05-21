/**
 * Mounts Team Hub panels into manager/admin HTML dashboards (vanilla shell).
 */
import { createRoot, type Root } from 'react-dom/client';
import { OrgChartPanel } from '@/features/team-hub/OrgChartPanel';
import { TaskManagerPanel } from '@/features/team-hub/TaskManagerPanel';
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

function mount(el: HTMLElement, panel: 'org' | 'tasks') {
  if (!el || el.dataset.teamHubMounted === '1') return;
  const root = createRoot(el);
  roots.set(el, root);
  el.dataset.teamHubMounted = '1';
  const userName = readStoredUserName();
  root.render(
    panel === 'org' ? <OrgChartPanel /> : <TaskManagerPanel userName={userName} />
  );
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

hrms.initTeamHubPanels = () => {
  hrms.mountTeamHubOrg?.('#teamHubOrgRoot');
  hrms.mountTeamHubOrg?.('#teamHubTeamsRoot');
  hrms.mountTeamHubTasks?.('#teamHubTasksRoot');
};
