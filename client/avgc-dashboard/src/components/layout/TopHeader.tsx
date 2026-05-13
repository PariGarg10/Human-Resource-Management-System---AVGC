import { ChevronDown, Menu, Search, Bell } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { EmployeeUser } from '@/types/employee';
import { cn } from '@/lib/cn';

type Props = {
  user: EmployeeUser | null;
  title: string;
  searchPlaceholder?: string;
  onSearchChange?: (q: string) => void;
  onMenuClick?: () => void;
};

export function TopHeader({
  user,
  title,
  searchPlaceholder = 'Find employees…',
  onSearchChange,
  onMenuClick,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const initial = (user?.name || user?.email || '?').charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-[100] flex h-16 shrink-0 items-center gap-4 border-b border-slate-200 bg-white/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-white/80 lg:px-6">
      {onMenuClick && (
        <button
          type="button"
          onClick={onMenuClick}
          className="rounded-xl border border-slate-200 p-2.5 text-slate-700 hover:bg-slate-50 md:hidden min-h-[44px] min-w-[44px]"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-semibold tracking-tight text-slate-900">{title}</h1>
      </div>

      <div className="relative hidden max-w-md flex-1 md:block">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden
        />
        <input
          type="search"
          placeholder={searchPlaceholder}
          value={q}
          onChange={(e) => {
            const v = e.target.value;
            setQ(v);
            onSearchChange?.(v);
          }}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm outline-none ring-[#1A237E]/20 focus:border-[#1A237E] focus:bg-white focus:ring-4"
          aria-label="Find employees"
        />
      </div>

      <button
        type="button"
        className="relative rounded-xl border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50 min-h-[44px] min-w-[44px]"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[#1A237E]" />
      </button>

      <div className="relative" ref={wrapRef}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1.5 pr-3 shadow-sm hover:bg-slate-50 min-h-[44px]"
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label="User menu"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#1A237E] text-sm font-semibold text-white">
            {initial}
          </span>
          <span className="hidden max-w-[140px] truncate text-sm font-medium text-slate-900 lg:inline">
            {user?.email || 'Account'}
          </span>
          <ChevronDown className={cn('h-4 w-4 text-slate-500 transition', open && 'rotate-180')} />
        </button>
        {open && (
          <div
            role="menu"
            className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
          >
            <div className="border-b border-slate-100 px-4 py-3">
              <div className="text-sm font-semibold text-slate-900">{user?.name || 'Employee'}</div>
              <div className="truncate text-xs text-slate-500">{user?.email}</div>
            </div>
            <button
              type="button"
              role="menuitem"
              className="block w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50"
              onClick={() => {
                localStorage.clear();
                window.location.href = '/login';
              }}
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
