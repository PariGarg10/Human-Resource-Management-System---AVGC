import { lazy, Suspense, type ReactNode } from 'react';

export const AttendancePanel = lazy(() =>
  import('@/views/AttendancePanel').then((m) => ({ default: m.AttendancePanel }))
);
export const AssetsPanel = lazy(() =>
  import('@/views/AssetsPanel').then((m) => ({ default: m.AssetsPanel }))
);
export const CalendarPanel = lazy(() =>
  import('@/views/CalendarPanel').then((m) => ({ default: m.CalendarPanel }))
);
export const HolidayCalendarPanel = lazy(() =>
  import('@/views/HolidayCalendarPanel').then((m) => ({ default: m.HolidayCalendarPanel }))
);
export const LeaveApplyPanel = lazy(() =>
  import('@/views/LeavePanels').then((m) => ({ default: m.LeaveApplyPanel }))
);
export const LeaveHistoryPanel = lazy(() =>
  import('@/views/LeavePanels').then((m) => ({ default: m.LeaveHistoryPanel }))
);
export const LiveActivitiesPanel = lazy(() =>
  import('@/views/LiveActivitiesPanel').then((m) => ({ default: m.LiveActivitiesPanel }))
);
export const OrgTreePanel = lazy(() =>
  import('@/features/team-hub/OrgTreePanel').then((m) => ({ default: m.OrgTreePanel }))
);
export const EmployeeDirectoryPanel = lazy(() =>
  import('@/views/EmployeeDirectoryPanel').then((m) => ({ default: m.EmployeeDirectoryPanel }))
);
export const LeaveApprovalPanel = lazy(() =>
  import('@/views/LeaveApprovalPanel').then((m) => ({ default: m.LeaveApprovalPanel }))
);
export const ManagerTeamAttendancePanel = lazy(() =>
  import('@/views/ManagerTeamAttendancePanel').then((m) => ({
    default: m.ManagerTeamAttendancePanel,
  }))
);
export const ExitPanel = lazy(() =>
  import('@/views/ExitPanel').then((m) => ({ default: m.ExitPanel }))
);
export const ManagerExitClearancesPanel = lazy(() =>
  import('@/views/ManagerExitClearancesPanel').then((m) => ({
    default: m.ManagerExitClearancesPanel,
  }))
);
export const OnboardingPanel = lazy(() =>
  import('@/views/OnboardingPanel').then((m) => ({ default: m.OnboardingPanel }))
);
export const PlaceholderPanel = lazy(() =>
  import('@/views/PlaceholderPanel').then((m) => ({ default: m.PlaceholderPanel }))
);
export const PoliciesPanel = lazy(() =>
  import('@/views/PoliciesPanel').then((m) => ({ default: m.PoliciesPanel }))
);
export const ProfilePanel = lazy(() =>
  import('@/views/ProfileSettingsPanels').then((m) => ({ default: m.ProfilePanel }))
);
export const SettingsPanel = lazy(() =>
  import('@/views/ProfileSettingsPanels').then((m) => ({ default: m.SettingsPanel }))
);
export const PerformancePanel = lazy(() =>
  import('@/views/PerformancePanel').then((m) => ({ default: m.PerformancePanel }))
);
export const SocialPortal = lazy(() => import('@/SocialPortal.jsx'));

function PanelFallback() {
  return (
    <div style={{ padding: 24 }}>
      <p className="stat-sub">Loading…</p>
    </div>
  );
}

export function LazyPanel({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PanelFallback />}>{children}</Suspense>;
}
