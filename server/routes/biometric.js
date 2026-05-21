const express = require('express');
const { format } = require('date-fns');
const { pool } = require('../db');
const { calculateTotalHours, getAttendanceStatus } = require('../utils/attendance');

const router = express.Router();

router.post('/punch', async (req, res) => {
  try {
    const providedApiKey = req.headers['x-api-key'] || req.body.api_key;
    if (!providedApiKey || providedApiKey !== process.env.BIOMETRIC_API_KEY) {
      return res.status(401).json({ message: 'Invalid biometric API key' });
    }

    const { employeecode, timestamp, type } = req.body;

    if (!employeecode || !timestamp || !['in', 'out'].includes(type)) {
      return res.status(400).json({ message: 'employeecode, timestamp, and valid type are required' });
    }

    const employeeResult = await pool.query('SELECT id, employeecode FROM employees WHERE employeecode = $1', [
      employeecode,
    ]);
    const employee = employeeResult.rows[0];

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const punchTime = new Date(timestamp);
    if (Number.isNaN(punchTime.getTime())) {
      return res.status(400).json({ message: 'Invalid timestamp format' });
    }

    const date = format(punchTime, 'yyyy-MM-dd');

    let attendanceResult = await pool.query(
      'SELECT * FROM attendancelogs WHERE employeeid = $1 AND date = $2::date',
      [employee.id, date]
    );
    let attendance = attendanceResult.rows[0];

    if (!attendance) {
      await pool.query('INSERT INTO attendancelogs (employeeid, date, status) VALUES ($1, $2::date, $3)', [
        employee.id,
        date,
        'absent',
      ]);
      attendanceResult = await pool.query(
        'SELECT * FROM attendancelogs WHERE employeeid = $1 AND date = $2::date',
        [employee.id, date]
      );
      attendance = attendanceResult.rows[0];
    }

    if (type === 'in') {
      if (!attendance.punchin) {
        await pool.query('UPDATE attendancelogs SET punchin = $1 WHERE id = $2', [
          punchTime.toISOString(),
          attendance.id,
        ]);
        return res.json({ message: 'Punch-in recorded', ignored: false });
      }
      return res.json({ message: 'Punch-in already recorded, ignored duplicate', ignored: true });
    }

    if (!attendance.punchin) {
      return res.status(400).json({ message: 'Punch-out received without a punch-in for the day' });
    }

    const totalHours = calculateTotalHours(attendance.punchin, punchTime.toISOString());
    const status = getAttendanceStatus(totalHours);

    await pool.query('UPDATE attendancelogs SET punchout = $1, totalhours = $2, status = $3 WHERE id = $4', [
      punchTime.toISOString(),
      totalHours,
      status,
      attendance.id,
    ]);

    return res.json({ message: 'Punch-out recorded', totalhours: totalHours, status });
  } catch (err) {
    console.error('POST /biometric/punch:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
