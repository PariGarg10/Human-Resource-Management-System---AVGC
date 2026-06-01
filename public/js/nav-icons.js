/**
 * Lucide icons for sidebar navigation.
 * Pick names from https://lucide.dev/icons — set data-lucide="icon-name" on .nav-icon
 */
window.HRMS = window.HRMS || {};

HRMS.refreshNavIcons = function refreshNavIcons(root) {
  if (!window.lucide || typeof lucide.createIcons !== 'function') return;
  const scope = root || document;
  lucide.createIcons({
    attrs: {
      'stroke-width': 1.75,
      'aria-hidden': 'true',
    },
    nameAttr: 'data-lucide',
    root: scope,
  });
};
