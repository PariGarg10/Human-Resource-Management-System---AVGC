const { getAttendanceStatus } = require('./attendance');

function getEffectiveAttendanceStatus({ totalhours, status, hasApprovedLeave }) {
  if (hasApprovedLeave || status === 'leave') {
    return 'leave';
  }
  const computed = getAttendanceStatus(totalhours);
  if (totalhours !== null && totalhours !== undefined) {
    return computed;
  }
  if (status === 'present' || status === 'halfday' || status === 'leave' || status === 'absent') {
    return status;
  }
  return computed;
}

module.exports = { getEffectiveAttendanceStatus };
