/**
 * Auto sign-out after 10 minutes with no user activity (all authenticated portals).
 */
(function () {
  window.HRMS = window.HRMS || {};

  const IDLE_MS = 10 * 60 * 1000;
  const THROTTLE_MS = 1000;

  let timer = null;
  let lastReset = 0;
  let signedOut = false;

  function performIdleLogout() {
    if (signedOut || !localStorage.getItem('token')) return;
    signedOut = true;
    clearTimeout(timer);

    if (typeof HRMS.toast === 'function') {
      HRMS.toast('Signed out due to 10 minutes of inactivity', 'info');
    }

    const token = localStorage.getItem('token');
    if (token) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        keepalive: true,
      }).catch(function () {});
    }

    window.setTimeout(function () {
      localStorage.clear();
      window.location.href = '/login';
    }, 600);
  }

  function resetIdleTimer() {
    if (signedOut || !localStorage.getItem('token')) return;
    const now = Date.now();
    if (now - lastReset < THROTTLE_MS) return;
    lastReset = now;
    clearTimeout(timer);
    timer = window.setTimeout(performIdleLogout, IDLE_MS);
  }

  function initIdleTimeout() {
    if (!localStorage.getItem('token')) return;

    var events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'click', 'wheel'];
    events.forEach(function (name) {
      document.addEventListener(name, resetIdleTimer, { passive: true, capture: true });
    });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') resetIdleTimer();
    });

    resetIdleTimer();
  }

  HRMS.initIdleTimeout = initIdleTimeout;
  HRMS.resetIdleTimer = resetIdleTimer;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initIdleTimeout);
  } else {
    initIdleTimeout();
  }
})();
