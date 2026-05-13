const { format, addDays, parseISO, isValid } = require('date-fns');

/**
 * @param {string | null | undefined} dateofbirth ISO date YYYY-MM-DD
 * @param {Date} ref reference date (usually today)
 * @returns {number | null} age in full years
 */
function ageFromDateOfBirth(dateofbirth, ref = new Date()) {
  if (!dateofbirth) return null;
  const d = parseISO(String(dateofbirth).slice(0, 10));
  if (!isValid(d)) return null;
  let age = ref.getFullYear() - d.getFullYear();
  const m = ref.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < d.getDate())) age -= 1;
  return age;
}

/**
 * Next calendar occurrence of birthday on or after `from` (date-only comparison).
 * @param {string} dateofbirth YYYY-MM-DD
 * @param {Date} from
 */
function nextBirthdayOccurrence(dateofbirth, from = new Date()) {
  const d = parseISO(String(dateofbirth).slice(0, 10));
  if (!isValid(d)) return null;
  const fromDay = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let y = fromDay.getFullYear();
  let next = new Date(y, d.getMonth(), d.getDate());
  if (next < fromDay) {
    next = new Date(y + 1, d.getMonth(), d.getDate());
  }
  return next;
}

/**
 * @param {Array<Record<string, unknown>>} rows with dateofbirth
 * @param {Date} from
 * @param {number} days inclusive window (e.g. 7 = today + next 6 days)
 */
function filterUpcomingBirthdays(rows, from = new Date(), days = 7) {
  const fromDay = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const endDay = addDays(fromDay, days - 1);
  const out = [];
  for (const row of rows) {
    if (!row.dateofbirth) continue;
    const next = nextBirthdayOccurrence(row.dateofbirth, fromDay);
    if (!next) continue;
    if (next <= endDay) {
      const daysUntil = Math.round((next - fromDay) / 86400000);
      out.push({
        ...row,
        nextBirthday: format(next, 'yyyy-MM-dd'),
        daysUntil,
      });
    }
  }
  return out.sort((a, b) => a.nextBirthday.localeCompare(b.nextBirthday));
}

module.exports = { ageFromDateOfBirth, nextBirthdayOccurrence, filterUpcomingBirthdays };
