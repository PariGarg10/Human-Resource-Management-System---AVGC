import { useCallback, useEffect, useState } from 'react';

function readTheme(): 'light' | 'dark' {
  try {
    const v = localStorage.getItem('theme_preference') || localStorage.getItem('hrms-theme');
    if (v === 'dark' || v === 'light') return v;
  } catch {
    /* ignore */
  }
  return 'light';
}

export function ThemeFab() {
  const [mode, setMode] = useState<'light' | 'dark'>(() =>
    typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark'
      ? 'dark'
      : readTheme()
  );

  useEffect(() => {
    const m = readTheme();
    document.documentElement.setAttribute('data-theme', m);
    setMode(m);
  }, []);

  const toggle = useCallback(() => {
    const next = mode === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('theme_preference', next);
      localStorage.removeItem('hrms-theme');
    } catch {
      /* ignore */
    }
    setMode(next);
  }, [mode]);

  return (
    <button
      type="button"
      className="fixed bottom-6 right-6 z-[200] flex h-12 w-12 items-center justify-center rounded-full border-0 text-xl shadow-lg transition-transform hover:scale-105"
      style={{ background: 'var(--red, #ed1d24)', color: 'var(--white, #fff)' }}
      aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={toggle}
    >
      {mode === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}
