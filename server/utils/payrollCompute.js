const fs = require('fs');
const path = require('path');
const { format, eachDayOfInterval, getDay } = require('date-fns');
const PDFDocument = require('pdfkit');
const { pool } = require('../db');
const { getHolidayDatesSet } = require('./holidaysRange');
const { getSaturdayConfigMerged } = require('./saturdayConfigRange');
const { getUploadsRoot } = require('./storagePaths');
const { PRESENT_MIN_HOURS, HALFDAY_MIN_HOURS } = require('./attendance');

function dateFromYmd(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function monthBounds(month, year) {
  const m = String(month).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();
  return {
    from: `${year}-${m}-01`,
    to: `${year}-${m}-${String(lastDay).padStart(2, '0')}`,
    workingDays: lastDay,
  };
}

async function countWorkingDaysInMonth(fromStr, toStr) {
  const holidayDates = await getHolidayDatesSet(fromStr, toStr);
  const offSaturdays = new Set(
    (await getSaturdayConfigMerged(fromStr, toStr))
      .filter((e) => e.status !== 'working')
      .map((e) => e.date)
  );
  let count = 0;
  for (const day of eachDayOfInterval({ start: dateFromYmd(fromStr), end: dateFromYmd(toStr) })) {
    const key = format(day, 'yyyy-MM-dd');
    if (getDay(day) === 0 || holidayDates.has(key) || offSaturdays.has(key)) continue;
    count += 1;
  }
  return count;
}

async function computeLopDays(employeeId, month, year) {
  const { from, to } = monthBounds(month, year);
  const workingDays = await countWorkingDaysInMonth(from, to);
  if (workingDays === 0) return { lopDays: 0, workingDays };

  const [attendance, leaves] = await Promise.all([
    pool.query(
      `SELECT date::text AS date, totalhours, status FROM attendancelogs
       WHERE employeeid = $1 AND date >= $2::date AND date <= $3::date`,
      [employeeId, from, to]
    ),
    pool.query(
      `SELECT fromdate::text, todate::text FROM leaves
       WHERE employeeid = $1 AND status = 'approved' AND todate >= $2::date AND fromdate <= $3::date`,
      [employeeId, from, to]
    ),
  ]);

  const approvedLeaveDates = new Set();
  for (const lv of leaves.rows) {
    for (const day of eachDayOfInterval({
      start: dateFromYmd(lv.fromdate),
      end: dateFromYmd(lv.todate),
    })) {
      approvedLeaveDates.add(format(day, 'yyyy-MM-dd'));
    }
  }

  const holidayDates = await getHolidayDatesSet(from, to);
  const offSaturdays = new Set(
    (await getSaturdayConfigMerged(from, to))
      .filter((e) => e.status !== 'working')
      .map((e) => e.date)
  );

  const attByDate = new Map(attendance.rows.map((r) => [r.date, r]));
  let lopDays = 0;

  for (const day of eachDayOfInterval({ start: dateFromYmd(from), end: dateFromYmd(to) })) {
    const key = format(day, 'yyyy-MM-dd');
    if (getDay(day) === 0 || holidayDates.has(key) || offSaturdays.has(key)) continue;
    if (approvedLeaveDates.has(key)) continue;

    const row = attByDate.get(key);
    if (!row) {
      lopDays += 1;
      continue;
    }
    if (row.status === 'leave' || row.status === 'on_leave') continue;
    const hours = Number(row.totalhours);
    if (!Number.isFinite(hours) || hours <= HALFDAY_MIN_HOURS) lopDays += 1;
    else if (hours > HALFDAY_MIN_HOURS && hours < PRESENT_MIN_HOURS) lopDays += 0.5;
  }

  return { lopDays, workingDays };
}

async function getSalaryStructure(employeeId) {
  const { rows } = await pool.query(
    `SELECT * FROM salary_structures WHERE employee_id = $1 ORDER BY effective_from DESC LIMIT 1`,
    [employeeId]
  );
  if (rows[0]) return rows[0];

  const emp = await pool.query('SELECT department, designation FROM employees WHERE id = $1', [employeeId]);
  const base = 25000;
  return {
    basic: base * 0.5,
    hra: base * 0.2,
    special_allowance: base * 0.2,
    other_allowance: base * 0.1,
    pf_applicable: true,
    esi_applicable: true,
    annual_ctc: base * 12,
  };
}

async function getApprovedReimbursements(employeeId, month, year) {
  const { rows } = await pool.query(
    `
      SELECT COALESCE(SUM(amount), 0)::float AS total
      FROM reimbursements
      WHERE employee_id = $1 AND status = 'approved' AND payroll_run_id IS NULL
        AND (expense_date IS NULL OR EXTRACT(MONTH FROM expense_date) = $2 AND EXTRACT(YEAR FROM expense_date) = $3)
    `,
    [employeeId, month, year]
  );
  return Number(rows[0]?.total || 0);
}

async function getPerformanceBonus(employeeId, month, year) {
  const [componentRes, annualRes, legacyRes] = await Promise.all([
    pool.query(
      `SELECT variable_bonus FROM payroll_components WHERE employee_id = $1 AND year = $2 AND source = 'performance'`,
      [employeeId, year]
    ),
    pool.query(
      `SELECT increment_percent, bonus_amount FROM annual_appraisals WHERE employee_id = $1 AND year = $2 AND status = 'FINALISED'`,
      [employeeId, year]
    ),
    pool.query(
      `
        SELECT COALESCE(SUM(bonus_amount), 0)::float AS total,
               COALESCE(MAX(increment_pct), 0)::float AS increment_pct
        FROM payroll_performance_bonuses
        WHERE employee_id = $1 AND payroll_run_id IS NULL
      `,
      [employeeId]
    ),
  ]);

  const variableBonus = Number(componentRes.rows[0]?.variable_bonus || 0);
  const annualBonus = Number(annualRes.rows[0]?.bonus_amount || 0);
  const incrementPct = Number(annualRes.rows[0]?.increment_percent || legacyRes.rows[0]?.increment_pct || 0);
  const legacyBonus = Number(legacyRes.rows[0]?.total || 0);

  return {
    bonus: variableBonus > 0 ? variableBonus : annualBonus > 0 ? annualBonus : legacyBonus,
    incrementPct,
  };
}

async function getTaxDeclaration(employeeId, year) {
  const fy = `${year}-${String((year + 1) % 100).padStart(2, '0')}`;
  const { rows } = await pool.query(
    `SELECT * FROM tax_declarations WHERE employee_id = $1 AND financial_year = $2`,
    [employeeId, fy]
  );
  return rows[0] || null;
}

function computeTds(gross, taxDecl) {
  const annualGross = gross * 12;
  const deductions =
    Number(taxDecl?.section_80c || 0) +
    Number(taxDecl?.section_80d || 0) +
    Number(taxDecl?.hra_exemption || 0);
  const taxable = Math.max(0, annualGross - deductions - 50000);
  const annualTds = taxable * 0.1;
  return Math.round((annualTds / 12) * 100) / 100;
}

async function computeEmployeePayroll(employeeId, month, year) {
  const salary = await getSalaryStructure(employeeId);
  const { lopDays, workingDays } = await computeLopDays(employeeId, month, year);
  const { bonus: perfBonus, incrementPct } = await getPerformanceBonus(employeeId, month, year);

  let basic = Number(salary.basic);
  let hra = Number(salary.hra);
  let allowances = Number(salary.special_allowance) + Number(salary.other_allowance);

  if (incrementPct > 0) {
    const factor = 1 + incrementPct / 100;
    basic *= factor;
    hra *= factor;
    allowances *= factor;
  }

  const gross = basic + hra + allowances;
  const dailyRate = workingDays > 0 ? gross / workingDays : 0;
  const lopDeduction = Math.round(dailyRate * lopDays * 100) / 100;
  const reimbursements = await getApprovedReimbursements(employeeId, month, year);

  const pf = salary.pf_applicable ? Math.round(basic * 0.12 * 100) / 100 : 0;
  const esi =
    salary.esi_applicable && gross <= 21000 ? Math.round(gross * 0.0075 * 100) / 100 : 0;
  const taxDecl = await getTaxDeclaration(employeeId, year);
  const tds = computeTds(gross - lopDeduction, taxDecl);

  const netPay = Math.max(
    0,
    Math.round((gross - lopDeduction - pf - esi - tds + reimbursements + perfBonus) * 100) / 100
  );

  return {
    employeeId,
    basic: Math.round(basic * 100) / 100,
    hra: Math.round(hra * 100) / 100,
    allowances: Math.round(allowances * 100) / 100,
    gross: Math.round(gross * 100) / 100,
    lopDays,
    lopDeduction,
    pf,
    esi,
    tds,
    reimbursements,
    bonus: 0,
    performanceBonus: perfBonus,
    netPay,
    breakdown: { workingDays, incrementPct },
  };
}

function payslipDir() {
  const dir = getUploadsRoot('payslips');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function generatePayslipPdf(employee, item, run) {
  const fileName = `payslip-${employee.id}-${run.period_year}-${run.period_month}-${Date.now()}.pdf`;
  const filePath = path.join(payslipDir(), fileName);

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    doc.fontSize(16).fillColor('#ed1d24').text('AVGC Studios — Payslip', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).fillColor('#333');
    doc.text(`Employee: ${employee.name} (${employee.employeecode || '—'})`);
    doc.text(`Period: ${run.period_month}/${run.period_year}`);
    doc.moveDown();
    doc.text(`Basic: ₹${item.basic}`);
    doc.text(`HRA: ₹${item.hra}`);
    doc.text(`Allowances: ₹${item.allowances}`);
    doc.text(`Gross: ₹${item.gross}`);
    doc.text(`LOP (${item.lop_days} days): -₹${item.lop_deduction}`);
    doc.text(`PF: -₹${item.pf}`);
    doc.text(`ESI: -₹${item.esi}`);
    doc.text(`TDS: -₹${item.tds}`);
    if (item.reimbursements > 0) doc.text(`Reimbursements: +₹${item.reimbursements}`);
    if (item.performance_bonus > 0) doc.text(`Performance bonus: +₹${item.performance_bonus}`);
    doc.moveDown();
    doc.fontSize(12).text(`Net Pay: ₹${item.net_pay}`, { underline: true });
    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  return `/uploads/payslips/${fileName}`;
}

function generateBankCsv(items, employeesById) {
  const lines = ['Beneficiary Name,Account Number,IFSC,Amount,Reference'];
  for (const item of items) {
    const emp = employeesById.get(item.employee_id);
    if (!emp || item.net_pay <= 0) continue;
    lines.push(
      [
        `"${emp.name}"`,
        emp.bank_account_number || '',
        emp.bank_ifsc || '',
        item.net_pay,
        `SAL-${item.employee_id}`,
      ].join(',')
    );
  }
  return lines.join('\n');
}

module.exports = {
  monthBounds,
  computeLopDays,
  computeEmployeePayroll,
  generatePayslipPdf,
  generateBankCsv,
  getSalaryStructure,
};
