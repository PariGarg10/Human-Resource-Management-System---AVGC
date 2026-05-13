const express = require('express');
const { format } = require('date-fns');
const { db } = require('../db');
const { calculateTotalHours, getAttendanceStatus } = require('../utils/attendance');

const router = express.Router();

router.post('/punch', (req, res) => {
  const providedApiKey = req.headers['x-api-key'] || req.body.api_key;
  if (!providedApiKey || providedApiKey !== process.env.BIOMETRIC_API_KEY) {
    return res.status(401).json({ message: 'Invalid biometric API key' });
  }

  const { employeecode, timestamp, type } = req.body;

  if (!employeecode || !timestamp || !['in', 'out'].includes(type)) {
    return res.status(400).json({ message: 'employeecode, timestamp, and valid type are required' });
  }

  const employee = db.prepare('SELECT id, employeecode FROM employees WHERE employeecode = ?').get(employeecode);

  if (!employee) {
    return res.status(404).json({ message: 'Employee not found' });
  }

  const punchTime = new Date(timestamp);
  if (Number.isNaN(punchTime.getTime())) {
    return res.status(400).json({ message: 'Invalid timestamp format' });
  }

  const date = format(punchTime, 'yyyy-MM-dd');

  let attendance = db
    .prepare('SELECT * FROM attendancelogs WHERE employeeid = ? AND date = ?')
    .get(employee.id, date);

  if (!attendance) {
    db.prepare('INSERT INTO attendancelogs (employeeid, date, status) VALUES (?, ?, ?)').run(employee.id, date, 'absent');
    attendance = db
      .prepare('SELECT * FROM attendancelogs WHERE employeeid = ? AND date = ?')
      .get(employee.id, date);
  }

  if (type === 'in') {
    if (!attendance.punchin) {
      db.prepare('UPDATE attendancelogs SET punchin = ? WHERE id = ?').run(punchTime.toISOString(), attendance.id);
      return res.json({ message: 'Punch-in recorded', ignored: false });
    }
    return res.json({ message: 'Punch-in already recorded, ignored duplicate', ignored: true });
  }

  if (!attendance.punchin) {
    return res.status(400).json({ message: 'Punch-out received without a punch-in for the day' });
  }

  const totalHours = calculateTotalHours(attendance.punchin, punchTime.toISOString());
  const status = getAttendanceStatus(totalHours);

  db.prepare('UPDATE attendancelogs SET punchout = ?, totalhours = ?, status = ? WHERE id = ?').run(
    punchTime.toISOString(),
    totalHours,
    status,
    attendance.id
  );

  return res.json({ message: 'Punch-out recorded', totalhours: totalHours, status });
});

module.exports = router;
