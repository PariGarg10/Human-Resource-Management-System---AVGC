import {
  Calendar,
  ClipboardList,
  FileEdit,
  History,
  Inbox,
  Network,
  Settings,
  User,
  type LucideIcon,
} from 'lucide-react';
import type { NavId } from '@/components/layout/Sidebar';
import { MODULE_NAV_IDS, type EmployeeModuleId } from '@/lib/employeeModules';

type Props = {
  module: EmployeeModuleId;
  title: string;
  navLabels: Record<NavId, string>;
  onBack: () => void;
  onSelect: (id: NavId) => void;
};

const NAV_ICONS: Partial<Record<NavId, LucideIcon>> = {
  dashboard: ClipboardList,
  calendar: Calendar,
  teams: Network,
  attendance: ClipboardList,
  'leave-apply': FileEdit,
  'leave-history': History,
  'helpdesk-raise': FileEdit,
  'helpdesk-my': History,
  'helpdesk-inbox': Inbox,
  profile: User,
  settings: Settings,
};

export function EmployeeModuleOptions({ module, title, navLabels, onBack, onSelect }: Props) {
  const options = MODULE_NAV_IDS[module];

  return (
    <div className="emp-picker min-h-screen bg-[var(--bg-primary)] px-4 py-10 md:px-8 md:py-14">
      <header className="mx-auto mb-10 max-w-6xl">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]"
        >
          ← All Modules
        </button>
        <h1 className="mt-2 font-['Bebas_Neue',sans-serif] text-4xl tracking-wide text-[var(--text-primary)] md:text-5xl">
          {title}
        </h1>
        <p className="mt-2 max-w-xl font-['DM_Sans',sans-serif] text-base text-[var(--text-muted)]">
          Select an option to open the page.
        </p>
      </header>

      <div className="mx-auto grid max-w-6xl gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
        {options.map((id) => {
          const Icon = NAV_ICONS[id] || ClipboardList;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              className="group rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
            >
              <div className="mb-4 inline-flex rounded-xl bg-[rgba(237,29,36,0.12)] p-3 text-[#ed1d24]">
                <Icon className="h-6 w-6" aria-hidden />
              </div>
              <h2 className="font-['Bebas_Neue',sans-serif] text-2xl tracking-wide text-[var(--text-primary)]">
                {navLabels[id]}
              </h2>
              <p className="mt-2 text-sm font-medium text-[var(--text-muted)]">
                Open {navLabels[id]}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
