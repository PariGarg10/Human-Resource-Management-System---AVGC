const { getAttendanceStatus } = require('./attendance');

function getEffectiveAttendanceStatus({ totalhours, status, hasApprovedLeave }) {
  const computed = getAttendanceStatus(totalhours);
  if (computed === 'present' || computed === 'halfday') {
    return computed;
  }
  if (hasApprovedLeave) {
    return 'leave';
  }
  if (status === 'present' || status === 'halfday' || status === 'leave' || status === 'absent') {
    return status;
  }
  return computed;
}

module.exports = { getEffectiveAttendanceStatus };
