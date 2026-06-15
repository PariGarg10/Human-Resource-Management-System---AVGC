import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { EmployeeUser } from '@/types/employee';

type Props = {
  user: EmployeeUser | null;
  className?: string;
  variant?: 'hero' | 'sidebar';
};

function formatPunch(value: string | null | undefined) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function PortalUserIdentity({ user, className = '', variant = 'hero' }: Props) {
  const [punchIn, setPunchIn] = useState('—');
  const [punchOut, setPunchOut] = useState('—');

  const loadPunch = useCallback(async () => {
    if (!user?.id) {
      setPunchIn('—');
      setPunchOut('—');
      return;
    }
    try {
      const data = await api<{ record?: { punchin?: string | null; punchout?: string | null } | null }>(
        '/api/attendance/today'
      );
      setPunchIn(formatPunch(data.record?.punchin));
      setPunchOut(formatPunch(data.record?.punchout));
    } catch {
      setPunchIn('—');
      setPunchOut('—');
    }
  }, [user?.id]);

  useEffect(() => {
    loadPunch().catch(() => {});
  }, [loadPunch]);

  const name = user?.name?.trim() || user?.email?.trim() || '—';
  const designation = user?.designation?.trim() || '—';
  const empId = user?.employeecode?.trim() || '—';

  return (
    <div className={`portal-user-identity portal-user-identity--${variant}${className ? ` ${className}` : ''}`}>
      <p className="portal-user-identity-name">{name}</p>
      <p className="portal-user-identity-line">{designation}</p>
      <p className="portal-user-identity-line">{empId}</p>
      <p className="portal-user-identity-line">{punchIn}</p>
      <p className="portal-user-identity-line">{punchOut}</p>
    </div>
  );
}

/** Sync legacy HTML sidebars (admin shell) with the same identity stack. */
export function syncPortalUserIdentityDom(
  user: EmployeeUser | null,
  punchIn: string,
  punchOut: string
) {
  const root = document.getElementById('sidebarUserIdentity');
  if (!root) return;
  const name = user?.name?.trim() || user?.email?.trim() || '—';
  const designation = user?.designation?.trim() || '—';
  const empId = user?.employeecode?.trim() || '—';
  root.innerHTML = `
    <p class="portal-user-identity-name">${escapeHtml(name)}</p>
    <p class="portal-user-identity-line">${escapeHtml(designation)}</p>
    <p class="portal-user-identity-line">${escapeHtml(empId)}</p>
    <p class="portal-user-identity-line">${escapeHtml(punchIn)}</p>
    <p class="portal-user-identity-line">${escapeHtml(punchOut)}</p>
  `;
  const side = document.getElementById('sidebarUserName');
  if (side) side.textContent = name;
  const nav = document.getElementById('navProfileEmail');
  if (nav) nav.textContent = name || user?.email || '—';
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
