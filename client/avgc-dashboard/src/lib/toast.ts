/** Uses legacy HRMS.toast when loaded from employee-dashboard.html */
export function toast(message: string, type: 'success' | 'error' | 'info' = 'info') {
  if (typeof window !== 'undefined' && window.HRMS?.toast) {
    window.HRMS.toast(message, type);
    return;
  }
  // Fallback when running Vite dev server without HRMS script
  console[type === 'error' ? 'error' : 'log'](`[${type}]`, message);
}
