import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { normalizePersonName } from './syncOrgProfiles';

export type OrgViewMode = 'focused' | 'full';

export type OrgRoleInfo = {
  isAdmin: boolean;
  isManager: boolean;
  userId: number | null;
  canToggleFullView: boolean;
  onboardingIncomplete: boolean;
  ready: boolean;
};

function parseEmployeeFromStorage(): {
  id?: number;
  role?: string;
  name?: string;
  onboardingCompleted?: boolean;
} | null {
  try {
    const raw = localStorage.getItem('employee');
    if (!raw) return null;
    return JSON.parse(raw) as {
      id?: number;
      role?: string;
      name?: string;
      onboardingCompleted?: boolean;
    };
  } catch {
    return null;
  }
}

function isPortalAdmin(role: string, name?: string): boolean {
  const r = role.toLowerCase().trim();
  if (r === 'admin' || r === 'founder' || r === 'it_head') return true;
  if (name && normalizePersonName(name) === 'ashish mishra') return true;
  return false;
}

function resolveOnboardingIncomplete(source: { role?: string; onboardingCompleted?: boolean } | null): boolean {
  if (!source) return false;
  const role = String(source.role || '').toLowerCase().trim();
  if (role !== 'employee') return false;
  return source.onboardingCompleted !== true;
}

function resolveRoleInfo(source: {
  id?: number;
  role?: string;
  name?: string;
  onboardingCompleted?: boolean;
} | null): OrgRoleInfo {
  if (!source) {
    return {
      isAdmin: false,
      isManager: false,
      userId: null,
      canToggleFullView: false,
      onboardingIncomplete: false,
      ready: true,
    };
  }

  const role = String(source.role || '').toLowerCase().trim();
  const name = String(source.name || '');
  const userId = typeof source.id === 'number' && source.id > 0 ? source.id : null;
  const isAdmin = isPortalAdmin(role, name);
  const isManager = role === 'manager';

  return {
    isAdmin,
    isManager,
    userId,
    canToggleFullView: isManager && !isAdmin,
    onboardingIncomplete: resolveOnboardingIncomplete(source),
    ready: true,
  };
}

export function useOrgRole(): OrgRoleInfo {
  const [info, setInfo] = useState<OrgRoleInfo>(() => ({
    ...resolveRoleInfo(parseEmployeeFromStorage()),
    ready: false,
  }));

  useEffect(() => {
    let cancelled = false;

    const syncFromStorage = () => {
      if (cancelled) return;
      setInfo((prev) => ({ ...resolveRoleInfo(parseEmployeeFromStorage()), ready: prev.ready || true }));
    };

    const load = async () => {
      try {
        const me = await api<{
          id: number;
          name: string;
          role: string;
          onboardingCompleted?: boolean;
        }>('/api/auth/me');
        if (!cancelled) {
          setInfo(
            resolveRoleInfo({
              id: me.id,
              name: me.name,
              role: me.role,
              onboardingCompleted: me.onboardingCompleted,
            })
          );
        }
      } catch {
        syncFromStorage();
      }
    };

    void load();
    window.addEventListener('storage', syncFromStorage);
    window.addEventListener('hrms:employee-updated', syncFromStorage);
    return () => {
      cancelled = true;
      window.removeEventListener('storage', syncFromStorage);
      window.removeEventListener('hrms:employee-updated', syncFromStorage);
    };
  }, []);

  return info;
}

export function getLoggedInEmployeeId(): number | null {
  const emp = parseEmployeeFromStorage();
  if (!emp || typeof emp.id !== 'number' || emp.id <= 0) return null;
  return emp.id;
}
