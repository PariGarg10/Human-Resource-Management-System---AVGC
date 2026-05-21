/** Toast UI that works without legacy HRMS scripts (employee React bundle). */
function ensureToastShell() {
  if (typeof document === 'undefined') return null;
  let style = document.getElementById('avgc-toast-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'avgc-toast-style';
    style.textContent =
      '@keyframes avgcToastIn{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:none}}@keyframes avgcToastOut{to{opacity:0;transform:translateY(-6px)}}';
    document.head.appendChild(style);
  }
  let root = document.getElementById('avgc-toast-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'avgc-toast-root';
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
    root.setAttribute('aria-relevant', 'additions text');
    document.body.appendChild(root);
  }
  root.style.cssText =
    'position:fixed;top:72px;right:12px;left:12px;z-index:2147483646;display:flex;flex-direction:column;align-items:flex-end;gap:8px;pointer-events:none;box-sizing:border-box;';
  return root;
}

function showDomToast(message: string, type: 'success' | 'error' | 'info') {
  const root = ensureToastShell();
  if (!root) return;
  const el = document.createElement('div');
  const isErr = type === 'error';
  const bg = isErr ? '#000000' : '#ed1d24';
  const border = isErr ? '2px solid #ed1d24' : 'none';
  el.style.cssText = [
    'pointer-events:auto',
    'max-width:min(100%,420px)',
    'padding:14px 18px',
    'border-radius:6px',
    `background:${bg}`,
    `border:${border}`,
    'color:#ffffff',
    'font-family:DM Sans,system-ui,sans-serif',
    'font-size:14px',
    'font-weight:600',
    'line-height:1.45',
    'box-shadow:0 12px 40px rgba(0,0,0,0.25)',
    'animation:avgcToastIn 0.28s ease forwards',
  ].join(';');
  el.textContent = message;
  root.appendChild(el);
  window.setTimeout(() => {
    el.style.animation = 'avgcToastOut 0.25s ease forwards';
    window.setTimeout(() => el.remove(), 260);
  }, 4500);
}

export function toast(message: string, type: 'success' | 'error' | 'info' = 'info') {
  if (typeof window === 'undefined') return;
  if (typeof window.HRMS?.toast === 'function') {
    window.HRMS.toast(message, type);
    return;
  }
  showDomToast(message, type);
}
