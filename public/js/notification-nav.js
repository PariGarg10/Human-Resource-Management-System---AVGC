/**
 * Map notification types to portal sections and navigate after read.
 */
(function () {
  window.HRMS = window.HRMS || {};

  const ADMIN_SECTION_MAP = {
    dashboard: 'dashboard',
    calendar: 'calendar',
    'holiday-calendar': 'holiday-calendar',
    attendance: 'attendance',
    'leave-apply': 'leave-apply',
    'leave-history': 'leaves',
    'leave-approval': 'leaves',
    'team-attendance': 'attendance',
    'asset-management': 'asset-management',
    'policies-and-links': 'policies-and-links',
    teams: 'teams',
    profile: 'profile',
    settings: 'settings',
    'live-activities': 'live-activity-links',
    'social-portal': 'company-social',
    reports: 'reports',
    helpdesk: 'dashboard',
    exit: 'exit',
    'exit-clearances': 'exit-clearances',
  };

  function readRole() {
    try {
      const emp = JSON.parse(localStorage.getItem('employee') || '{}');
      return String(emp.role || '').toLowerCase();
    } catch (_e) {
      return '';
    }
  }

  function isAdminPortal() {
    return /\/admin\/dashboard/i.test(window.location.pathname || '');
  }

  HRMS.resolveNotificationNav = function resolveNotificationNav(type, message) {
    const t = String(type || '').toLowerCase();
    const msg = String(message || '').toLowerCase();
    const role = readRole();

    if (t === 'broadcast') {
      if (msg.includes('asset')) return 'asset-management';
      if (msg.includes('holiday')) return 'holiday-calendar';
      if (msg.includes('policy') || msg.includes('policies')) return 'policies-and-links';
      if (msg.includes('leave')) return 'leave-history';
      if (msg.includes('social') || msg.includes('gaming')) return 'social-portal';
      return 'dashboard';
    }

    if (t === 'leave_applied') {
      if (role === 'manager' || role === 'admin' || role === 'founder' || role === 'it_head') {
        return 'leave-approval';
      }
      return 'leave-history';
    }

    if (t.startsWith('leave_')) return 'leave-history';

    if (t.includes('concern')) return 'helpdesk';

    if (t === 'birthday') return 'teams';

    if (t.includes('live_activity') || t === 'live_activity' || t === 'live_activity_winner') {
      return 'live-activities';
    }

    if (msg.includes('asset')) return 'asset-management';
    if (msg.includes('attendance')) return 'attendance';

    if (t.startsWith('exit_') || t === 'exit_initiated' || t === 'exit_completed') {
      if (msg.includes('your exit')) return 'exit';
      if (role === 'manager') return 'exit-clearances';
      if (role === 'admin' || role === 'founder' || role === 'it_head') return 'exit-clearances';
      return 'exit';
    }

    return 'dashboard';
  };

  HRMS.navigateForNotification = function navigateForNotification(type, message) {
    const nav = HRMS.resolveNotificationNav(type, message);

    if (isAdminPortal()) {
      const section = ADMIN_SECTION_MAP[nav] || nav;
      const btn = document.querySelector(`.sidebar-nav [data-nav="${section}"]`);
      if (btn instanceof HTMLElement) {
        btn.click();
        return true;
      }
    }

    window.dispatchEvent(
      new CustomEvent('hrms:portal-nav', { detail: { nav, source: 'notification' } })
    );
    return true;
  };
})();
