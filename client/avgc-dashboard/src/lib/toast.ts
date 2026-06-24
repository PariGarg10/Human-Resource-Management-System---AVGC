/** Toast UI that works without legacy HRMS scripts (employee React bundle). */
function ensureToastShell() {
  if (typeof document === 'undefined') return null;
  let style = document.getElementById('avgc-toast-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'avgc-toast-style';
    style.textContent =
      '@keyframes avgcToastIn{from{opacity:0;transform:translateY(-12px) scale(0.96)}to{opacity:1;transform:none}}@keyframes avgcToastOut{to{opacity:0;transform:translateY(-8px) scale(0.98)}}';
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
    'position:fixed;top:50%;left:50%;right:auto;transform:translate(-50%,-50%);z-index:2147483646;display:flex;flex-direction:column;align-items:center;gap:12px;pointer-events:none;box-sizing:border-box;width:min(92vw,560px);';
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
    'width:100%',
    'max-width:560px',
    'padding:18px 24px',
    'border-radius:12px',
    `background:${bg}`,
    `border:${border}`,
    'color:#ffffff',
    'font-family:Verdana,Geneva,sans-serif',
    'font-size:16px',
    'font-weight:700',
    'line-height:1.45',
    'text-align:center',
    'box-shadow:0 24px 64px rgba(0,0,0,0.35)',
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
