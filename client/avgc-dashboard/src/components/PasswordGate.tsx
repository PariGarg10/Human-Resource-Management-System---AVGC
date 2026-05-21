import { type FormEvent, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';

export function PasswordGate({ message }: { message?: string }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await api('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      toast('Password updated. Signing out…', 'success');
      setTimeout(() => {
        localStorage.clear();
        window.location.href = '/login';
      }, 900);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  }

  return (
    <div
      className="rounded-xl border border-amber-200 bg-amber-50 p-6 shadow-sm"
      role="alert"
    >
      <h2 className="text-lg font-semibold text-amber-950">Password update required</h2>
      <p className="mt-2 text-sm text-amber-900">
        {message ||
          'Change your password to continue. After updating, sign in again with your new password.'}
      </p>
      <form onSubmit={onSubmit} className="mt-6 grid max-w-lg gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-800 sm:col-span-2">
          Current password
          <input
            type="password"
            required
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm min-h-[44px]"
          />
        </label>
        <label className="text-sm font-medium text-slate-800 sm:col-span-2">
          New password
          <input
            type="password"
            required
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm min-h-[44px]"
          />
        </label>
        <button
          type="submit"
          className="rounded-xl bg-avgc-brand px-6 py-3 text-sm font-semibold text-white sm:col-span-2 min-h-[44px] w-fit"
        >
          Update password
        </button>
      </form>
    </div>
  );
}
