export {};

declare global {
  interface Window {
    HRMS?: {
      toast: (message: string, type?: string) => void;
      mountTeamHubOrg?: (target: HTMLElement | string) => void;
      mountTeamHubTasks?: (target: HTMLElement | string) => void;
      mountAttendanceCalendar?: (target: HTMLElement | string) => void;
      refreshTeamHubPanels?: () => void;
      initTeamHubPanels?: () => void;
    };
  }
}
