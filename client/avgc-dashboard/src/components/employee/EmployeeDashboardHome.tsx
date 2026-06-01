import {
  Briefcase,
  Clock,
  Headphones,
  LayoutDashboard,
  LogOut,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { logout } from '@/lib/api';
import type { EmployeeModuleId } from '@/lib/employeeModules';

type CardDef = {
  id: EmployeeModuleId;
  title: string;
  description: string;
  icon: LucideIcon;
  accent: string;
};

const CARDS: CardDef[] = [
  {
    id: 'workspace',
    title: 'My Dashboard',
    description: 'Your home dashboard and daily overview',
    icon: LayoutDashboard,
    accent: 'linear-gradient(145deg, #1e3a5f 0%, #2563eb 55%, #7c3aed 100%)',
  },
  {
    id: 'people',
    title: 'People',
    description: 'Team org chart and colleagues on your crew',
    icon: Users,
    accent: 'linear-gradient(145deg, #14532d 0%, #16a34a 55%, #84cc16 100%)',
  },
  {
    id: 'time',
    title: 'Attendance & Leave',
    description: 'Punch, attendance, leave, and your schedule',
    icon: Clock,
    accent: 'linear-gradient(145deg, #7c2d12 0%, #ea580c 55%, #fbbf24 100%)',
  },
  {
    id: 'helpdesk',
    title: 'Helpdesk',
    description: 'Raise concerns and track HR or IT tickets',
    icon: Headphones,
    accent: 'linear-gradient(145deg, #4c1d95 0%, #7c3aed 55%, #c026d3 100%)',
  },
  {
    id: 'account',
    title: 'Account',
    description: 'Profile, settings, and personal preferences',
    icon: Briefcase,
    accent: 'linear-gradient(145deg, #1f2937 0%, #374151 55%, #6b7280 100%)',
  },
];

type Props = {
  userName?: string;
  onSelect: (module: EmployeeModuleId) => void;
};

export function EmployeeDashboardHome({ userName, onSelect }: Props) {
  const greeting = userName?.split(/\s+/)[0] || 'there';

  return (
    <div className="emp-picker min-h-screen bg-[var(--bg-primary)] px-4 py-10 md:px-8 md:py-14">
      <header className="mx-auto mb-10 max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-['DM_Sans',sans-serif] text-sm font-medium uppercase tracking-[0.2em] text-[var(--text-muted)]">
            AVGC HRMS
          </p>
          <button
            type="button"
            onClick={() => logout()}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Logout
          </button>
        </div>
        <h1 className="mt-2 font-['Bebas_Neue',sans-serif] text-4xl tracking-wide text-[var(--text-primary)] md:text-5xl">
          Welcome back, {greeting}
        </h1>
        <p className="mt-2 max-w-xl font-['DM_Sans',sans-serif] text-base text-[var(--text-muted)]">
          Choose a module to step into — your full workspace lives behind each portal.
        </p>
      </header>

      <div className="mx-auto grid max-w-6xl gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
        {CARDS.map((card) => (
          <ModuleCard key={card.id} card={card} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

function ModuleCard({
  card,
  onSelect,
}: {
  card: CardDef;
  onSelect: (id: EmployeeModuleId) => void;
}) {
  const Icon = card.icon;

  return (
    <button
      type="button"
      onClick={() => onSelect(card.id)}
      className="emp-module-card group relative flex min-h-[220px] overflow-hidden rounded-2xl text-left shadow-md transition duration-300 ease-out hover:-translate-y-1 hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ed1d24]"
    >
      <div
        className="absolute inset-0 scale-105 transition duration-500 group-hover:scale-110"
        style={{ background: card.accent }}
        aria-hidden
      />
      <div
        className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-black/10"
        aria-hidden
      />
      <div className="absolute right-4 top-4 rounded-full bg-white/15 p-3 backdrop-blur-sm">
        <Icon className="h-7 w-7 text-white" strokeWidth={1.75} aria-hidden />
      </div>
      <div className="relative mt-auto w-full p-6 pt-16">
        <h2 className="font-['Bebas_Neue',sans-serif] text-2xl tracking-wide text-white">{card.title}</h2>
        <p className="mt-1 font-['DM_Sans',sans-serif] text-sm leading-snug text-white/85">
          {card.description}
        </p>
        <span className="mt-4 inline-block font-['DM_Sans',sans-serif] text-xs font-semibold uppercase tracking-wider text-white/70 transition group-hover:text-white">
          Enter module →
        </span>
      </div>
    </button>
  );
}
