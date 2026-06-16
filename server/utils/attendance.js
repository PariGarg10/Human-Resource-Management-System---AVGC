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

const HALFDAY_MIN_HOURS = 4;
const PRESENT_MIN_HOURS = 9;

function getAttendanceStatus(totalHours) {
  if (totalHours === null || totalHours === undefined) return 'absent';
  if (totalHours >= PRESENT_MIN_HOURS) return 'present';
  if (totalHours > HALFDAY_MIN_HOURS && totalHours < PRESENT_MIN_HOURS) return 'halfday';
  return 'absent';
}

module.exports = { calculateTotalHours, getAttendanceStatus, HALFDAY_MIN_HOURS, PRESENT_MIN_HOURS };
