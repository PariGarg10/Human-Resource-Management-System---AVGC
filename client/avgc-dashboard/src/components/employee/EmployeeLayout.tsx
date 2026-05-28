import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';

type Props = {
  children: ReactNode;
  onBack: () => void;
};

export function EmployeeLayout({ children, onBack }: Props) {
  return (
    <div className="emp-module-shell flex min-h-screen flex-col">
      <div className="sticky top-0 z-[110] flex items-center border-b border-[var(--border)] bg-[var(--bg-card)]/95 px-4 py-2.5 backdrop-blur md:px-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg px-2 font-['DM_Sans',sans-serif] text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--bg-secondary)]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          All Modules
        </button>
      </div>
      <div className="emp-module-body flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
