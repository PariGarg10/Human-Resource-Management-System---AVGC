import { useCallback, useEffect, useState } from 'react';
import { ProfilePhotoImg } from '@/components/ui/ProfilePhotoImg';
import { useUser } from '@/context/UserContext';
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

function identityInitial(name: string) {
  return (name.trim()[0] || '—').toUpperCase();
}

export function PortalUserIdentity({ user, className = '', variant = 'hero' }: Props) {
  const { avatarOverride } = useUser();
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
  const photo = avatarOverride || user?.profilePhotoUrl || null;

  if (variant === 'hero') {
    return (
      <div className={`portal-user-identity portal-user-identity--hero${className ? ` ${className}` : ''}`}>
        <div className="portal-user-identity-photo-wrap" aria-hidden={photo ? undefined : true}>
          <ProfilePhotoImg
            src={photo}
            employeeId={user?.id ?? null}
            className="portal-user-identity-photo"
            fallback={
              <span className="portal-user-identity-photo portal-user-identity-photo--fallback">
                {identityInitial(name)}
              </span>
            }
          />
        </div>
        <div className="portal-user-identity-details">
          <p className="portal-user-identity-name">{name}</p>
          <div className="portal-user-identity-labeled">
            <span className="portal-user-identity-label">Designation</span>
            <span className="portal-user-identity-value">{designation}</span>
          </div>
          <p className="portal-user-identity-line">{empId}</p>
          <p className="portal-user-identity-line">{punchIn}</p>
          <p className="portal-user-identity-line">{punchOut}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`portal-user-identity portal-user-identity--sidebar${className ? ` ${className}` : ''}`}>
      <p className="portal-user-identity-name">{name}</p>
      <div className="portal-user-identity-labeled">
        <span className="portal-user-identity-label">Designation</span>
        <span className="portal-user-identity-value">{designation}</span>
      </div>
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
    <div class="portal-user-identity-labeled">
      <span class="portal-user-identity-label">Designation</span>
      <span class="portal-user-identity-value">${escapeHtml(designation)}</span>
    </div>
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
