import { useEffect, type ReactNode } from 'react';
import { PortalUserIdentity } from '@/components/PortalUserIdentity';
import { usePortalShell } from '@/hooks/usePortalShell';
import { useUser } from '@/context/UserContext';
import { EMPLOYEE_NAV_SECTIONS, type NavSection, type PortalNavId } from '@/lib/portalNav';

type Props = {
  activeNav: PortalNavId;
  pageTitle: string;
  children: ReactNode;
  portalLabel?: string;
  rolePill?: string;
  sidebarRoleClass?: string;
  navSections?: NavSection[];
  onNavigate: (id: PortalNavId) => void;
};

/** Shared dashboard shell — same structure/classes as manager HTML portal. */
export function PortalAppShell({
  activeNav,
  pageTitle,
  children,
  portalLabel = 'Employee',
  rolePill = 'Employee',
  navSections = EMPLOYEE_NAV_SECTIONS,
  onNavigate,
}: Props) {
  const { user, avatarOverride } = useUser();
  usePortalShell(activeNav, user, onNavigate);

  const displayName = user?.name || user?.email || 'Employee';
  const initial = (displayName.trim()[0] || 'E').toUpperCase();
  const photo = avatarOverride || user?.profilePhotoUrl || null;

  useEffect(() => {
    const lucide = (window as unknown as { lucide?: { createIcons?: () => void } }).lucide;
    lucide?.createIcons?.();
  }, [activeNav, photo, displayName]);

  useEffect(() => {
    const breadcrumb = document.getElementById('breadcrumbCurrent');
    if (breadcrumb) breadcrumb.textContent = pageTitle;
  }, [pageTitle]);

  return (
    <>
      <div className="sidebar-overlay" />
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src="/assets/avgc-logo.png" alt="AVGC" className="sidebar-logo-img" />
          <div className="sidebar-title">
            AVGC <small>{portalLabel}</small>
          </div>
        </div>
        <div className="sidebar-profile">
          {photo ? (
            <img
              id="sidebarAvatar"
              src={photo}
              alt=""
              className="sidebar-avatar"
              style={{ objectFit: 'cover', borderRadius: '50%' }}
            />
          ) : (
            <div className="sidebar-avatar" id="sidebarAvatar">
              {initial}
            </div>
          )}
          <div className="sidebar-user-meta">
            <PortalUserIdentity user={user} variant="sidebar" />
            <div className="sidebar-user-name" id="sidebarUserName" hidden>
              {displayName}
            </div>
          </div>
        </div>
        <nav className="sidebar-nav">
          {navSections.map((section) => {
            const isDirect = section.items.length === 1 && !section.items[0].disabled;
            if (isDirect) {
              const item = section.items[0];
              return (
                <div
                  key={section.key}
                  className="sidebar-nav-section sidebar-nav-section--direct"
                  data-section={section.key}
                >
                  <button
                    type="button"
                    className={`sidebar-accordion-head${activeNav === item.id ? ' is-active' : ''}`}
                    data-nav={item.id}
                    title={section.label}
                  >
                    <span className="nav-icon" data-lucide={section.icon} />
                    <span className="nav-label">{section.label}</span>
                  </button>
                </div>
              );
            }
            return (
              <div key={section.key} className="sidebar-nav-section" data-section={section.key}>
                <button type="button" className="sidebar-accordion-head">
                  <span className="nav-icon" data-lucide={section.icon} />
                  <span className="nav-label">{section.label}</span>
                </button>
                <div className="sidebar-accordion-body">
                  {section.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      data-nav={item.id}
                      disabled={item.disabled}
                      className={[
                        activeNav === item.id ? 'is-active' : undefined,
                        item.disabled ? 'nav-item-disabled' : undefined,
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <span className="nav-icon" data-lucide={item.icon} />
                      <span>{item.label}</span>
                      {item.badge ? <span className="nav-coming-soon-badge">{item.badge}</span> : null}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <button type="button" className="sidebar-toggle" id="sidebarCollapseBtn">
            Collapse
          </button>
          <button type="button" className="sidebar-logout-btn" id="logoutBtn" aria-label="Sign out">
            <span className="nav-icon" data-lucide="log-out" />
            <span className="sidebar-logout-label">Sign out</span>
          </button>
        </div>
      </aside>

      <div className="app-main">
        <header className="top-navbar">
          <div className="navbar-left">
            <button type="button" className="mobile-menu-btn" id="mobileMenuBtn">
              ☰
            </button>
            <div className="breadcrumb">
              {portalLabel} / <strong id="breadcrumbCurrent">{pageTitle}</strong>
            </div>
          </div>
          <div className="navbar-right">
            <span className="navbar-clock" id="navbarClock" />
            <div className="notification-wrap">
              <button
                type="button"
                className="theme-toggle-btn notification-bell-btn"
                id="notificationBell"
                aria-label="Notifications"
              >
                <span className="nav-icon notification-bell-icon" data-lucide="bell" />
                <span id="notificationBadge" className="hidden">
                  0
                </span>
              </button>
              <div id="notificationPanel" className="notification-panel">
                <div id="notificationList" />
              </div>
            </div>
            <button
              type="button"
              className="theme-toggle-btn navbar-legacy-theme-toggle"
              id="themeToggleBtn"
            >
              ◐
            </button>
            <span className="role-pill">{rolePill}</span>
            <div className="profile-dropdown-wrap">
              <button type="button" className="profile-chip">
                <img
                  id="navAvatar"
                  className="navbar-avatar hidden"
                  width={28}
                  height={28}
                  alt=""
                  style={{ borderRadius: '50%', objectFit: 'cover' }}
                />
                <span id="navProfileEmail">{user?.email || '—'}</span>
              </button>
              <div className="profile-dropdown">
                <button type="button" id="dropdownLogout" className="profile-dropdown-logout">
                  <span className="nav-icon" data-lucide="log-out" />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          </div>
        </header>
        <main className="content-area">{children}</main>
      </div>
    </>
  );
}
