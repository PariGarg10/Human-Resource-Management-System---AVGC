import { useMemo } from 'react';

export function useOrgRole() {
  return useMemo(() => {
    try {
      const raw = localStorage.getItem('employee');
      if (!raw) return { isAdmin: false };
      const emp = JSON.parse(raw) as { role?: string };
      const role = String(emp.role || '').toLowerCase().trim();
      return { isAdmin: role === 'admin' };
    } catch {
      return { isAdmin: false };
    }
  }, []);
}
