import { useEffect, useRef } from 'react';
import { syncPortalUserIdentityDom } from '@/components/PortalUserIdentity';
import { api, logout } from '@/lib/api';
import type { PortalNavId } from '@/lib/portalNav';
import type { EmployeeUser } from '@/types/employee';

type HrmsWindow = {
  HRMS?: {
    initSidebar?: (o: {
      onNavigate?: (section: string) => void;
    }) => void;
    initNavbarClock?: (id: string) => void;
    initNotificationBell?: (fn: (path: string, opts?: RequestInit) => Promise<unknown>) => void;
    initProfileDropdown?: () => void;
    syncNavProfileName?: (name: string, email: string) => void;
    applyProfilePhotoToDom?: (url: string, name: string) => void;
    refreshNavIcons?: (root?: ParentNode) => void;
    toggleTheme?: () => void;
  };
};

export function usePortalShell(
  activeNav: PortalNavId,
  user: EmployeeUser | null,
  onNavigate: (id: PortalNavId) => void
) {
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;

  useEffect(() => {
    const HRMS = (window as HrmsWindow).HRMS;
    if (!HRMS?.initSidebar) return;

    HRMS.initSidebar({
      onNavigate: (section) => onNavigateRef.current(section as PortalNavId),
    });
    HRMS.initNavbarClock?.('navbarClock');
    HRMS.initProfileDropdown?.();
    HRMS.initNotificationBell?.((path, opts) => api(path, opts || {}));

    const logoutBtn = document.getElementById('logoutBtn');
    const dropdownLogout = document.getElementById('dropdownLogout');
    const onLogout = () => logout();
    logoutBtn?.addEventListener('click', onLogout);
    dropdownLogout?.addEventListener('click', onLogout);
    const themeBtn = document.getElementById('themeToggleBtn');
    const onTheme = () => HRMS.toggleTheme?.();
    themeBtn?.addEventListener('click', onTheme);

    return () => {
      logoutBtn?.removeEventListener('click', onLogout);
      dropdownLogout?.removeEventListener('click', onLogout);
      themeBtn?.removeEventListener('click', onTheme);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    const HRMS = (window as HrmsWindow).HRMS;
    HRMS?.syncNavProfileName?.(user.name || '', user.email || '');
    const photo = user.profilePhotoUrl;
    if (photo && HRMS?.applyProfilePhotoToDom) {
      HRMS.applyProfilePhotoToDom(photo, user.name || '');
    }
  }, [user]);

  useEffect(() => {
    if (!user?.id) return;
    const formatPunch = (value: string | null | undefined) => {
      if (!value) return '—';
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return '—';
      return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    };
    api<{ record?: { punchin?: string | null; punchout?: string | null } | null }>('/api/attendance/today')
      .then((data) => {
        syncPortalUserIdentityDom(user, formatPunch(data.record?.punchin), formatPunch(data.record?.punchout));
      })
      .catch(() => {
        syncPortalUserIdentityDom(user, '—', '—');
      });
  }, [user]);

  useEffect(() => {
    document.querySelectorAll('.sidebar-nav [data-nav]').forEach((btn) => {
      const id = btn.getAttribute('data-nav');
      btn.classList.toggle('is-active', id === activeNav);
    });
    document.querySelectorAll('[data-profile-nav]').forEach((btn) => {
      const id = btn.getAttribute('data-profile-nav');
      btn.classList.toggle('is-active', id === activeNav);
    });
    const activeBtn = document.querySelector(`.sidebar-nav [data-nav="${activeNav}"]`);
    if (activeBtn) {
      const section = activeBtn.closest('.sidebar-nav-section');
      const isMobile = window.matchMedia('(max-width: 1024px)').matches;
      if (section && isMobile) section.classList.add('is-expanded');
      else section?.classList.remove('is-expanded');
    }
    const HRMS = (window as HrmsWindow).HRMS;
    HRMS?.refreshNavIcons?.(document.querySelector('.sidebar') || document);
  }, [activeNav]);
}
