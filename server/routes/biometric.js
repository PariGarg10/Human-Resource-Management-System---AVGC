const express = require('express');
const { format } = require('date-fns');
const { pool } = require('../db');
const { calculateTotalHours, getAttendanceStatus } = require('../utils/attendance');
const { upsertAttendanceFromDeviceRecords } = require('../utils/deviceAttendance');

const router = express.Router();

function verifyBiometricApiKey(req, res) {
  const providedApiKey = req.headers['x-api-key'] || req.body?.api_key;
  if (!providedApiKey || providedApiKey !== process.env.BIOMETRIC_API_KEY) {
    res.status(401).json({ message: 'Invalid biometric API key' });
    return false;
  }
  return true;
}

/**
 * Push ESSL/ZKTeco attendance logs from a machine on your office LAN (bridge script).
 * Required when the API is hosted on Vercel — cloud servers cannot reach 192.168.x.x devices.
 */
router.post('/essl-sync', async (req, res) => {
  try {
    if (!verifyBiometricApiKey(req, res)) return;

    const records = Array.isArray(req.body?.records) ? req.body.records : [];
    if (!records.length) {
      return res.status(400).json({ message: 'records array is required' });
    }

    const summary = await upsertAttendanceFromDeviceRecords(records, {
      dayStart: process.env.ESSL_DAY_START || '09:30',
      dayEnd: process.env.ESSL_DAY_END || '23:59',
      lookbackDays: Number(process.env.ESSL_LOOKBACK_DAYS || 14),
    });

    return res.json({
      message: 'ESSL attendance processed',
      ...summary,
    });
  } catch (err) {
    console.error('POST /biometric/essl-sync:', err.message);
    return res.status(500).json({ message: err.message || 'Internal server error' });
  }
});

router.post('/punch', async (req, res) => {
  try {
    if (!verifyBiometricApiKey(req, res)) return;

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
