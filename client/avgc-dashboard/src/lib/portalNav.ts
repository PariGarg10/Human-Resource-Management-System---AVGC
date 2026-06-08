/** Portal navigation — shared ids for modules that use the same React UI across roles. */

export type PortalNavId =
  | 'dashboard'
  | 'profile'
  | 'settings'
  | 'asset-management'
  | 'policies-and-links'
  | 'attendance'
  | 'calendar'
  | 'holiday-calendar'
  | 'leave-apply'
  | 'leave-history'
  | 'teams'
  | 'employee-profiles'
  | 'live-activities'
  | 'nominations'
  | 'team-attendance'
  | 'leave-approval'
  | 'reports'
  | 'helpdesk';

export type PortalRole = 'employee' | 'manager';

export type NavItem = {
  id: PortalNavId;
  label: string;
  icon: string;
  disabled?: boolean;
  badge?: string;
};

export type NavSection = {
  key: string;
  label: string;
  icon: string;
  items: NavItem[];
};

/** Shared workspace + people + time modules — identical React panels for manager and employee. */
const SHARED_WORKSPACE: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'holiday-calendar', label: 'Holiday Calendar', icon: 'calendar-days' },
];

const SHARED_TIME: NavItem[] = [
  { id: 'attendance', label: 'Attendance', icon: 'clipboard-check' },
  { id: 'leave-apply', label: 'Leave Management', icon: 'palmtree' },
  { id: 'leave-history', label: 'Leave history', icon: 'history' },
];

const SHARED_ASSETS: NavSection = {
  key: 'assets',
  label: 'Asset management',
  icon: 'laptop',
  items: [{ id: 'asset-management', label: 'Asset management', icon: 'laptop' }],
};

const SHARED_POLICIES: NavSection = {
  key: 'policies',
  label: 'Policies & important links',
  icon: 'book-marked',
  items: [{ id: 'policies-and-links', label: 'Policies & important links', icon: 'file-text' }],
};

const SHARED_ACCOUNT: NavItem[] = [
  { id: 'profile', label: 'Profile', icon: 'user-circle' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

const MANAGER_ONLY_CONTROLS: NavItem[] = [
  { id: 'team-attendance', label: 'Team attendance', icon: 'users-round' },
  { id: 'leave-approval', label: 'Leave approval', icon: 'clipboard-check' },
];

const SHARED_LIVE_ACTIVITIES: NavSection = {
  key: 'live-activities',
  label: 'Live activities',
  icon: 'radio',
  items: [
    { id: 'live-activities', label: 'Receive links', icon: 'link' },
    { id: 'nominations', label: 'Nominations', icon: 'award' },
  ],
};

export const MANAGER_NAV_SECTIONS: NavSection[] = [
  {
    key: 'workspace',
    label: 'My workspace',
    icon: 'layout-grid',
    items: SHARED_WORKSPACE,
  },
  {
    key: 'people',
    label: 'People',
    icon: 'users-round',
    items: [
      { id: 'teams', label: 'Organization chart', icon: 'network' },
      { id: 'employee-profiles', label: 'Employee profiles', icon: 'id-card' },
    ],
  },
  {
    key: 'time-attendance',
    label: 'Time & attendance',
    icon: 'clock',
    items: SHARED_TIME,
  },
  {
    key: 'manager-controls',
    label: 'Manager controls',
    icon: 'briefcase-business',
    items: MANAGER_ONLY_CONTROLS,
  },
  SHARED_ASSETS,
  SHARED_POLICIES,
  SHARED_LIVE_ACTIVITIES,
  {
    key: 'account',
    label: 'Account',
    icon: 'circle-user',
    items: SHARED_ACCOUNT,
  },
];

export const EMPLOYEE_NAV_SECTIONS: NavSection[] = [
  {
    key: 'workspace',
    label: 'My workspace',
    icon: 'layout-grid',
    items: SHARED_WORKSPACE,
  },
  {
    key: 'people',
    label: 'People',
    icon: 'users-round',
    items: [
      { id: 'teams', label: 'Organization chart', icon: 'network' },
      { id: 'employee-profiles', label: 'Employee profiles', icon: 'id-card' },
    ],
  },
  {
    key: 'time-attendance',
    label: 'Time & attendance',
    icon: 'clock',
    items: SHARED_TIME,
  },
  SHARED_ASSETS,
  SHARED_POLICIES,
  SHARED_LIVE_ACTIVITIES,
  {
    key: 'account',
    label: 'Account',
    icon: 'circle-user',
    items: SHARED_ACCOUNT,
  },
];

export const PORTAL_PAGE_TITLES: Record<PortalNavId, string> = {
  dashboard: 'Dashboard',
  profile: 'Profile',
  settings: 'Settings',
  'asset-management': 'Asset management',
  'policies-and-links': 'Policies & important links',
  attendance: 'Attendance',
  calendar: 'Calendar',
  'holiday-calendar': 'Holiday Calendar',
  'leave-apply': 'Leave Management',
  'leave-history': 'Leave history',
  teams: 'Organization chart',
  'employee-profiles': 'Employee profiles',
  'live-activities': 'Live activities',
  nominations: 'Nominations',
  'team-attendance': 'Team attendance',
  'leave-approval': 'Leave approval',
  reports: 'Reports',
  helpdesk: 'Helpdesk',
};

export function detectPortalRole(pathname?: string): PortalRole {
  const path = (pathname || window.location.pathname).replace(/\/$/, '') || '/';
  return path.startsWith('/manager/dashboard') ? 'manager' : 'employee';
}

export function navSectionsForRole(role: PortalRole): NavSection[] {
  return role === 'manager' ? MANAGER_NAV_SECTIONS : EMPLOYEE_NAV_SECTIONS;
}
