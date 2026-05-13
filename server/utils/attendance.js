const { differenceInMinutes } = require('date-fns');

function calculateTotalHours(punchIn, punchOut) {
  if (!punchIn || !punchOut) return null;

  const inTime = new Date(punchIn);
  const outTime = new Date(punchOut);

  if (Number.isNaN(inTime.getTime()) || Number.isNaN(outTime.getTime()) || outTime < inTime) {
    return null;
  }

  const minutes = differenceInMinutes(outTime, inTime);
  return Number((minutes / 60).toFixed(2));
}

function getAttendanceStatus(totalHours) {
  if (totalHours === null || totalHours === undefined) return 'absent';
  if (totalHours >= 8.5) return 'present';
  if (totalHours >= 4) return 'halfday';
  return 'absent';
}

module.exports = { calculateTotalHours, getAttendanceStatus };
