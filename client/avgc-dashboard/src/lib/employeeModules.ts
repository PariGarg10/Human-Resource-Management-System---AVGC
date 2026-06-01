import type { NavId } from '@/components/layout/Sidebar';

export type EmployeeModuleId = 'workspace' | 'people' | 'time' | 'helpdesk' | 'account';

export const MODULE_TITLES: Record<EmployeeModuleId, string> = {
  workspace: 'My Dashboard',
  people: 'People',
  time: 'Attendance & Leave',
  helpdesk: 'Helpdesk',
  account: 'Account',
};

export const MODULE_DEFAULT_NAV: Record<EmployeeModuleId, NavId> = {
  workspace: 'dashboard',
  people: 'teams',
  time: 'attendance',
  helpdesk: 'helpdesk-raise',
  account: 'profile',
};

export const MODULE_NAV_IDS: Record<EmployeeModuleId, NavId[]> = {
  workspace: ['dashboard'],
  people: ['teams'],
  time: ['attendance', 'calendar', 'leave-apply', 'leave-history'],
  helpdesk: ['helpdesk-raise', 'helpdesk-my', 'helpdesk-inbox'],
  account: ['profile', 'settings'],
};

export function navAllowedInModule(module: EmployeeModuleId, nav: NavId): boolean {
  return MODULE_NAV_IDS[module].includes(nav);
}

export function moduleForNav(nav: NavId): EmployeeModuleId | null {
  const entries = Object.entries(MODULE_NAV_IDS) as Array<[EmployeeModuleId, NavId[]]>;
  for (const [module, ids] of entries) {
    if (ids.includes(nav)) return module;
  }
  return null;
}
