import { MessageSquare, PanelRightClose, Send, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { MOCK_MESSAGES, MOCK_TEAM, type BuzzChannel } from '@/data/mockBuzz';
import { cn } from '@/lib/cn';

type Props = {
  open: boolean;
  onToggle: () => void;
  userDepartment?: string;
};

const tabs: { id: BuzzChannel; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'department', label: 'Department' },
  { id: 'projects', label: 'Projects' },
];

export function AVGCBuzz({ open, onToggle, userDepartment }: Props) {
  const [channel, setChannel] = useState<BuzzChannel>('general');
  const [draft, setDraft] = useState('');

  const visible = useMemo(
    () => MOCK_MESSAGES.filter((m) => m.channel === channel),
    [channel]
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#1A237E] text-white shadow-lg ring-4 ring-white hover:bg-[#151c68] min-h-[44px] min-w-[44px]"
        aria-label="Open AVGC Buzz chat"
      >
        <MessageSquare className="h-6 w-6" />
      </button>
    );
  }

  return (
    <aside
      className="fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-[min(100vw-1rem,22rem)] shrink-0 flex-col border-l border-slate-200 bg-white shadow-xl xl:static xl:inset-auto xl:z-auto xl:max-w-[22rem] xl:shadow-sm"
      aria-label="AVGC Buzz company chat"
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-[#1A237E]" aria-hidden />
          <span className="font-semibold text-slate-900">AVGC Buzz</span>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 min-h-[44px] min-w-[44px]"
          aria-label="Collapse AVGC Buzz"
        >
          <PanelRightClose className="h-5 w-5" />
        </button>
      </div>

      <div className="flex gap-1 border-b border-slate-100 px-2 py-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setChannel(t.id)}
            className={cn(
              'flex-1 rounded-lg px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide min-h-[44px]',
              channel === t.id
                ? 'bg-[#1A237E] text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="border-b border-slate-100 px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <Users className="h-4 w-4" />
          Team presence
        </div>
        <ul className="mt-2 max-h-28 space-y-2 overflow-y-auto">
          {MOCK_TEAM.filter(
            (p) => channel !== 'department' || !userDepartment || p.department === userDepartment
          ).map((p) => (
            <li key={p.id} className="flex items-center justify-between text-sm">
              <span className="truncate text-slate-800">{p.name}</span>
              <span
                className={cn(
                  'h-2.5 w-2.5 shrink-0 rounded-full',
                  p.is_clocked_in ? 'bg-emerald-500' : 'bg-slate-300'
                )}
                title={p.is_clocked_in ? 'Clocked in' : 'Away'}
                aria-label={p.is_clocked_in ? `${p.name} is clocked in` : `${p.name} is away`}
              />
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
          {visible.map((m) => (
            <div key={m.id} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-slate-900">{m.sender}</span>
                <time className="text-[10px] text-slate-400" dateTime={m.at}>
                  {new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </time>
              </div>
              <div className="rounded-2xl rounded-tl-sm bg-slate-100 px-3 py-2 text-sm text-slate-800">
                {m.body}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-100 p-3">
          <div className="flex gap-2">
            <label htmlFor="buzz-draft" className="sr-only">
              Message
            </label>
            <input
              id="buzz-draft"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Write a message…"
              className="min-h-[44px] flex-1 rounded-xl border border-slate-200 px-3 text-sm outline-none ring-[#1A237E]/20 focus:border-[#1A237E] focus:ring-4"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  setDraft('');
                }
              }}
            />
            <button
              type="button"
              className="rounded-xl bg-[#1A237E] px-4 text-white hover:bg-[#151c68] min-h-[44px] min-w-[44px]"
              aria-label="Send message"
              onClick={() => setDraft('')}
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
          <p className="mt-2 text-[10px] text-slate-400">Demo chat — messages are not persisted.</p>
        </div>
      </div>
    </aside>
  );
}
