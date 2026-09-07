const { getAttendanceStatus, HALFDAY_MIN_HOURS, PRESENT_MIN_HOURS } = require('./attendance');

function hoursForStoredStatus(status) {
  if (status === 'present') return PRESENT_MIN_HOURS;
  if (status === 'halfday') return HALFDAY_MIN_HOURS;
  if (status === 'leave') return 0;
  return 0;
}

function getEffectiveAttendanceStatus({ totalhours, status, hasApprovedLeave }) {
  if (hasApprovedLeave || status === 'leave') {
    return 'leave';
  }
  const normalizedStatus = String(status || '').toLowerCase();
  const hours =
    totalhours !== null && totalhours !== undefined && !Number.isNaN(Number(totalhours))
      ? Number(totalhours)
      : null;

  if (hours !== null) {
    const expectedForStatus = hoursForStoredStatus(normalizedStatus);
    if (
      (normalizedStatus === 'present' || normalizedStatus === 'halfday' || normalizedStatus === 'absent') &&
      Math.abs(hours - expectedForStatus) < 0.01
    ) {
      return normalizedStatus;
    }
    return getAttendanceStatus(hours);
  }

  if (normalizedStatus === 'present' || normalizedStatus === 'halfday' || normalizedStatus === 'absent') {
    return normalizedStatus;
  }
  return getAttendanceStatus(hours);
}

function formatHoursValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (Number.isNaN(num)) return null;
  return Number(num.toFixed(2));
}

module.exports = { getEffectiveAttendanceStatus, formatHoursValue, hoursForStoredStatus };
