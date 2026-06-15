/** Load Maya chatbot only when the user clicks the launcher (saves ~120KB on initial load). */
export function schedulePolicyChatbot() {
  if (document.getElementById('hrms-chat-launcher') || document.getElementById('policy-chat-root')) {
    return;
  }

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'hrms-chat-launcher';
  btn.className = 'hrms-chat-launcher';
  btn.setAttribute('aria-label', 'Open HR assistant Maya');
  btn.title = 'Ask Maya (HR assistant)';
  btn.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

  let loading = false;
  btn.addEventListener('click', () => {
    if (loading) return;
    loading = true;
    btn.setAttribute('aria-busy', 'true');
    void import('../policy-chatbot-entry')
      .then((m) => {
        m.mountPolicyChatbot({ open: true });
        btn.remove();
      })
      .catch(() => {
        loading = false;
        btn.removeAttribute('aria-busy');
      });
  });

  const mount = () => {
    if (!document.body) return;
    document.body.appendChild(btn);
  };

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(mount, { timeout: 3000 });
  } else {
    globalThis.setTimeout(mount, 500);
  }
}
