import type { ReactNode } from 'react';
import {
  CalendarDays,
  ClipboardCheck,
  FileText,
  LogOut,
  Monitor,
  Palmtree,
} from 'lucide-react';
import type { PortalNavId } from '@/lib/portalNav';

type Action = {
  id: string;
  label: string;
  nav: PortalNavId;
  icon: ReactNode;
  hidden?: boolean;
};

type Props = {
  onNavigate: (id: PortalNavId) => void;
  showExitClearance?: boolean;
};

export function ManagerQuickActions({ onNavigate, showExitClearance = false }: Props) {
  const actions = [
    {
      id: 'attendance',
      label: 'Mark Attendance',
      nav: 'attendance' as const,
      icon: <ClipboardCheck size={22} strokeWidth={2} />,
    },
    {
      id: 'leave-approval',
      label: 'Approve Leave',
      nav: 'leave-approval' as const,
      icon: <Palmtree size={22} strokeWidth={2} />,
    },
    {
      id: 'team-schedule',
      label: 'Team Schedule',
      nav: 'team-attendance' as const,
      icon: <CalendarDays size={22} strokeWidth={2} />,
    },
    {
      id: 'it-request',
      label: 'Raise IT Request',
      nav: 'helpdesk' as const,
      icon: <Monitor size={22} strokeWidth={2} />,
    },
    {
      id: 'exit-clearance',
      label: 'Exit Clearance',
      nav: 'exit-clearances' as const,
      icon: <LogOut size={22} strokeWidth={2} />,
      hidden: !showExitClearance,
    },
    {
      id: 'policies',
      label: 'View Policies',
      nav: 'policies-and-links' as const,
      icon: <FileText size={22} strokeWidth={2} />,
    },
  ].filter((a) => !a.hidden) satisfies Action[];

  return (
    <section className="manager-quick-actions" aria-label="Quick actions">
      <h3 className="manager-section-title">Quick actions</h3>
      <div className="manager-quick-actions-scroll">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            className="manager-quick-action-card"
            onClick={() => onNavigate(action.nav)}
          >
            <span className="manager-quick-action-icon" aria-hidden="true">
              {action.icon}
            </span>
            <span className="manager-quick-action-label">{action.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
