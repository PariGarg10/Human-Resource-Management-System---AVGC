export {};

declare global {
  interface Window {
    HRMS?: {
      toast: (message: string, type?: string) => void;
      mountTeamHubOrgTree?: (target: HTMLElement | string) => void;
      mountAttendanceCalendar?: (target: HTMLElement | string) => void;
      mountHolidayCalendar?: (target: HTMLElement | string) => void;
      refreshTeamHubPanels?: () => void;
      mountPortalDashboard?: (target: HTMLElement | string) => void;
      mountLeaveApply?: (target: HTMLElement | string) => void;
    };
  }
}
