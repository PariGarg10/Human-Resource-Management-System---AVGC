const { format } = require('date-fns');

/** Consistent display: DD MMM YYYY */
function formatDisplayDate(value) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return format(d, 'dd MMM yyyy');
}

function formatDisplayDateTime(value) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return format(d, 'dd MMM yyyy, HH:mm');
}

module.exports = { formatDisplayDate, formatDisplayDateTime };
