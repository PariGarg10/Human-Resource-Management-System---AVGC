import { Clock, CalendarDays, Users } from 'lucide-react';

type Props = {
  onClock: () => void;
  onLeave: () => void;
  onTeam: () => void;
};

export function QuickActions({ onClock, onLeave, onTeam }: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:col-span-2 lg:col-span-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Quick actions</h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <button
          type="button"
          onClick={onClock}
          className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-[#1A237E] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#151c68] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1A237E]"
        >
          <Clock className="h-5 w-5" aria-hidden />
          Clock-In / Out
        </button>
        <button
          type="button"
          onClick={onLeave}
          className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
        >
          <CalendarDays className="h-5 w-5 text-[#1A237E]" aria-hidden />
          Apply for Leave
        </button>
        <button
          type="button"
          onClick={onTeam}
          className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
        >
          <Users className="h-5 w-5 text-[#1A237E]" aria-hidden />
          Team availability
        </button>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Clock updates typically flow through your biometric or hardware punch — use My Attendance for today&apos;s
        detail.
      </p>
    </div>
  );
}
