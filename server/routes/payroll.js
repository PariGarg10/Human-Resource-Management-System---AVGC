const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { pool } = require('../db');
const {
  authMiddleware,
  enforceForcePasswordChange,
  requirePortalAdmin,
  requireRoles,
} = require('../middleware/auth');
const { createNotification } = require('../utils/notifications');
const { ensurePayrollSchema } = require('../utils/payrollSchema');
const {
  computeEmployeePayroll,
  generatePayslipPdf,
  generateBankCsv,
  getSalaryStructure,
} = require('../utils/payrollCompute');
const { getUploadsRoot } = require('../utils/storagePaths');
const { allClearancesApproved } = require('../utils/exitHelpers');

const reimbUploadDir = getUploadsRoot('reimbursements');
const reimbBillUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, reimbUploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').slice(0, 12).toLowerCase() || '.bin';
      const allowed = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp']);
      const safeExt = allowed.has(ext) ? ext : '.bin';
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${safeExt}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const router = express.Router();
router.use(authMiddleware);
router.use(enforceForcePasswordChange);
router.use(async (_req, res, next) => {
  try {
    await ensurePayrollSchema();
    next();
  } catch (e) {
    console.error('Payroll schema ensure failed:', e.message);
    return res.status(500).json({ message: 'Payroll module is initializing. Please refresh in a moment.' });
  }
});

function mapPayrollItem(row) {
  const n = (v) => {
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
  };
  return {
    id: row.id,
    payrollRunId: row.payroll_run_id,
    employeeId: row.employee_id,
    basic: n(row.basic),
    hra: n(row.hra),
    allowances: n(row.allowances),
    gross: n(row.gross),
    lopDays: n(row.lop_days),
    lopDeduction: n(row.lop_deduction),
    pf: n(row.pf),
    esi: n(row.esi),
    tds: n(row.tds),
    reimbursements: n(row.reimbursements),
    bonus: n(row.bonus),
    performanceBonus: n(row.performance_bonus),
    netPay: n(row.net_pay),
    payslipUrl: row.payslip_url || null,
    breakdown: row.breakdown || null,
  };
}

function mapSalaryStructure(salary) {
  const n = (v) => {
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
  };
  return {
    basic: n(salary?.basic),
    hra: n(salary?.hra),
    specialAllowance: n(salary?.special_allowance),
    otherAllowance: n(salary?.other_allowance),
    annualCtc: n(salary?.annual_ctc),
    pfApplicable: salary?.pf_applicable !== false,
    esiApplicable: salary?.esi_applicable !== false,
    effectiveFrom: salary?.effective_from || null,
    configured: Boolean(salary?.id),
  };
}

function splitMonthlyFromAnnualCtc(annualCtc) {
  const annual = Number(annualCtc);
  if (!Number.isFinite(annual) || annual <= 0) {
    return { basic: 0, hra: 0, special_allowance: 0, other_allowance: 0, annual_ctc: 0 };
  }
  const monthly = annual / 12;
  return {
    basic: Math.round(monthly * 0.5 * 100) / 100,
    hra: Math.round(monthly * 0.2 * 100) / 100,
    special_allowance: Math.round(monthly * 0.2 * 100) / 100,
    other_allowance: Math.round(monthly * 0.1 * 100) / 100,
    annual_ctc: Math.round(annual * 100) / 100,
  };
}

function mapReimbursement(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    amount: Number(row.amount),
    status: row.status,
    description: row.description || null,
    expenseDate: row.expense_date || null,
    receiptUrl: row.receipt_url || null,
    createdAt: row.created_at,
  };
}

function pushImportError(results, { line, employeecode, employeeId, message }) {
  results.errors.push({
    line,
    employeecode: employeecode || null,
    employeeId: employeeId || null,
    message,
  });
}

function mapEmployeeSetupRow(row) {
  return {
    id: row.id,
    employeecode: row.employeecode || null,
    name: row.name,
    department: row.department || null,
    designation: row.designation || null,
    bankAccountName: row.bank_account_name || null,
    bankAccountNumber: row.bank_account_number || null,
    bankIfsc: row.bank_ifsc || null,
    bankConfigured: Boolean(row.bank_account_number && row.bank_ifsc),
    salaryStructure: mapSalaryStructure(
      row.salary_structure_id
        ? {
            id: row.salary_structure_id,
            basic: row.basic,
            hra: row.hra,
            special_allowance: row.special_allowance,
            other_allowance: row.other_allowance,
            annual_ctc: row.annual_ctc,
            pf_applicable: row.pf_applicable,
            esi_applicable: row.esi_applicable,
            effective_from: row.effective_from,
          }
        : null
    ),
  };
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

async function upsertSalaryStructure(employeeId, body) {
  let basic = Number(body?.basic || 0);
  let hra = Number(body?.hra || 0);
  let specialAllowance = Number(body?.specialAllowance ?? body?.special_allowance ?? 0);
  let otherAllowance = Number(body?.otherAllowance ?? body?.other_allowance ?? 0);
  let annualCtc = Number(body?.annualCtc ?? body?.annual_ctc ?? 0);

  if (annualCtc > 0 && basic <= 0 && hra <= 0) {
    const split = splitMonthlyFromAnnualCtc(annualCtc);
    basic = split.basic;
    hra = split.hra;
    specialAllowance = split.special_allowance;
    otherAllowance = split.other_allowance;
    annualCtc = split.annual_ctc;
  } else if (annualCtc <= 0 && basic + hra + specialAllowance + otherAllowance > 0) {
    annualCtc = Math.round((basic + hra + specialAllowance + otherAllowance) * 12 * 100) / 100;
  }

  const { rows } = await pool.query(
    `
      INSERT INTO salary_structures (
        employee_id, basic, hra, special_allowance, other_allowance, annual_ctc,
        pf_applicable, esi_applicable, effective_from
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8, COALESCE($9::date, CURRENT_DATE))
      ON CONFLICT (employee_id, effective_from) DO UPDATE SET
        basic = EXCLUDED.basic,
        hra = EXCLUDED.hra,
        special_allowance = EXCLUDED.special_allowance,
        other_allowance = EXCLUDED.other_allowance,
        annual_ctc = EXCLUDED.annual_ctc,
        pf_applicable = EXCLUDED.pf_applicable,
        esi_applicable = EXCLUDED.esi_applicable
      RETURNING *
    `,
    [
      employeeId,
      basic,
      hra,
      specialAllowance,
      otherAllowance,
      annualCtc,
      body?.pfApplicable !== false && body?.pf_applicable !== false,
      body?.esiApplicable !== false && body?.esi_applicable !== false,
      body?.effectiveFrom || body?.effective_from || null,
    ]
  );
  return rows[0];
}

async function updateEmployeeBank(employeeId, body) {
  const bankAccountName = body?.bankAccountName != null ? String(body.bankAccountName).trim() : null;
  const bankAccountNumber = body?.bankAccountNumber != null ? String(body.bankAccountNumber).trim() : null;
  const bankIfsc = body?.bankIfsc != null ? String(body.bankIfsc).trim().toUpperCase() : null;
  if (!bankAccountNumber || !bankIfsc) {
    const err = new Error('Bank account number and IFSC are required');
    err.status = 400;
    throw err;
  }
  await pool.query(
    `UPDATE employees SET bank_account_name = $2, bank_account_number = $3, bank_ifsc = $4 WHERE id = $1`,
    [employeeId, bankAccountName, bankAccountNumber, bankIfsc]
  );
}

/** GET /api/payroll/my — employee payslips + salary structure */
router.get('/my', requireRoles('employee', 'manager'), async (req, res) => {
  try {
    const salary = await getSalaryStructure(req.user.id);
    const { rows: payslips } = await pool.query(
      `
        SELECT pi.*, pr.period_month, pr.period_year, pr.status AS run_status
        FROM payroll_items pi
        JOIN payroll_runs pr ON pr.id = pi.payroll_run_id
        WHERE pi.employee_id = $1 AND pr.status = 'finalized'
        ORDER BY pr.period_year DESC, pr.period_month DESC
        LIMIT 24
      `,
      [req.user.id]
    );
    const tax = await pool.query(
      `SELECT * FROM tax_declarations WHERE employee_id = $1 ORDER BY submitted_at DESC LIMIT 1`,
      [req.user.id]
    );
    return res.json({
      salaryStructure: mapSalaryStructure(salary),
      payslips: payslips.map((r) => ({
        ...mapPayrollItem(r),
        periodMonth: Number(r.period_month),
        periodYear: Number(r.period_year),
      })),
      taxDeclaration: tax.rows[0] || null,
    });
  } catch (err) {
    console.error('GET /payroll/my:', err.message, err.stack);
    return res.status(500).json({ message: 'Could not load payroll data. Please try again or contact HR.' });
  }
});

/** POST /api/payroll/reimbursements */
router.post('/reimbursements', requireRoles('employee', 'manager'), reimbBillUpload.single('bill'), async (req, res) => {
  try {
    const title = String(req.body?.title || '').trim();
    const amount = Number(req.body?.amount);
    const description = req.body?.description != null ? String(req.body.description).trim() : null;
    const expenseDate = req.body?.expenseDate || null;
    if (!title || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: 'title and positive amount required' });
    }
    const receiptUrl = req.file ? `/uploads/reimbursements/${req.file.filename}` : null;
    const { rows } = await pool.query(
      `INSERT INTO reimbursements (employee_id, title, amount, description, expense_date, receipt_url)
       VALUES ($1, $2, $3, $4, $5::date, $6) RETURNING *`,
      [req.user.id, title, amount, description, expenseDate, receiptUrl]
    );
    const mgrs = await pool.query(
      `SELECT managerid FROM manageremployees WHERE employeeid = $1`,
      [req.user.id]
    );
    for (const m of mgrs.rows) {
      await createNotification(m.managerid, 'payroll_reimbursement', `${req.user.name} submitted a reimbursement claim.`, {
        subjectEmployeeId: req.user.id,
      });
    }
    return res.status(201).json({ reimbursement: mapReimbursement(rows[0]) });
  } catch (err) {
    console.error('POST /payroll/reimbursements:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** POST /api/payroll/reimbursements/:id/receipt — attach bill to an existing claim */
router.post(
  '/reimbursements/:id/receipt',
  requireRoles('employee', 'manager'),
  reimbBillUpload.single('bill'),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ message: 'Valid reimbursement id required' });
      if (!req.file) return res.status(400).json({ message: 'Bill file required' });

      const { rows } = await pool.query(`SELECT * FROM reimbursements WHERE id = $1`, [id]);
      const row = rows[0];
      if (!row) return res.status(404).json({ message: 'Reimbursement not found' });
      if (row.employee_id !== req.user.id) {
        return res.status(403).json({ message: 'You can only upload bills for your own claims' });
      }
      if (row.status !== 'pending') {
        return res.status(400).json({ message: 'Bills can only be added to pending claims' });
      }

      const receiptUrl = `/uploads/reimbursements/${req.file.filename}`;
      const updated = await pool.query(
        `UPDATE reimbursements SET receipt_url = $2 WHERE id = $1 RETURNING *`,
        [id, receiptUrl]
      );
      return res.json({ reimbursement: mapReimbursement(updated.rows[0]) });
    } catch (err) {
      console.error('POST /payroll/reimbursements/:id/receipt:', err.message);
      return res.status(500).json({ message: 'Could not upload bill' });
    }
  }
);

/** GET /api/payroll/reimbursements/my */
router.get('/reimbursements/my', requireRoles('employee', 'manager'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM reimbursements WHERE employee_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    return res.json({ items: rows.map(mapReimbursement) });
  } catch (err) {
    console.error('GET /payroll/reimbursements/my:', err.message);
    return res.status(500).json({ message: 'Could not load reimbursements' });
  }
});

/** POST /api/payroll/overtime */
router.post('/overtime', requireRoles('employee', 'manager'), async (req, res) => {
  try {
    const claimDate = String(req.body?.claimDate || '').trim();
    const hours = Number(req.body?.hours);
    const reason = req.body?.reason != null ? String(req.body.reason).trim() : null;
    if (!claimDate || !Number.isFinite(hours) || hours <= 0) {
      return res.status(400).json({ message: 'claimDate and hours required' });
    }
    const { rows } = await pool.query(
      `INSERT INTO overtime_claims (employee_id, claim_date, hours, reason) VALUES ($1, $2::date, $3, $4) RETURNING *`,
      [req.user.id, claimDate, hours, reason]
    );
    return res.status(201).json({ claim: rows[0] });
  } catch (err) {
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** PUT /api/payroll/tax-declaration */
router.put('/tax-declaration', requireRoles('employee', 'manager'), async (req, res) => {
  try {
    const year = Number(req.body?.financialYear?.split('-')[0]) || new Date().getFullYear();
    const fy = req.body?.financialYear || `${year}-${String((year + 1) % 100).padStart(2, '0')}`;
    const { rows } = await pool.query(
      `
        INSERT INTO tax_declarations (employee_id, financial_year, regime, section_80c, section_80d, hra_exemption, other_declarations)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
        ON CONFLICT (employee_id, financial_year) DO UPDATE SET
          regime = EXCLUDED.regime,
          section_80c = EXCLUDED.section_80c,
          section_80d = EXCLUDED.section_80d,
          hra_exemption = EXCLUDED.hra_exemption,
          other_declarations = EXCLUDED.other_declarations,
          submitted_at = NOW()
        RETURNING *
      `,
      [
        req.user.id,
        fy,
        req.body?.regime || 'new',
        Number(req.body?.section80c || 0),
        Number(req.body?.section80d || 0),
        Number(req.body?.hraExemption || 0),
        JSON.stringify(req.body?.other || {}),
      ]
    );
    return res.json({ declaration: rows[0] });
  } catch (err) {
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** POST /api/payroll/queries */
router.post('/queries', requireRoles('employee', 'manager'), async (req, res) => {
  try {
    const subject = String(req.body?.subject || '').trim();
    const message = String(req.body?.message || '').trim();
    const payrollItemId = req.body?.payrollItemId ? Number(req.body.payrollItemId) : null;
    if (!subject || !message) return res.status(400).json({ message: 'subject and message required' });
    await pool.query(
      `INSERT INTO payroll_queries (employee_id, payroll_item_id, subject, message) VALUES ($1, $2, $3, $4)`,
      [req.user.id, payrollItemId, subject, message]
    );
    return res.json({ message: 'Query submitted to HR' });
  } catch (err) {
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** GET /api/payroll/manager/pending — reimbursements + overtime */
router.get('/manager/pending', requireRoles('manager', 'admin', 'founder'), async (req, res) => {
  try {
    const [reimb, ot] = await Promise.all([
      pool.query(
        `
          SELECT r.*, e.name AS employee_name
          FROM reimbursements r
          JOIN employees e ON e.id = r.employee_id
          JOIN manageremployees me ON me.employeeid = r.employee_id AND me.managerid = $1
          WHERE r.status = 'pending'
          ORDER BY r.created_at ASC
        `,
        [req.user.id]
      ),
      pool.query(
        `
          SELECT o.*, e.name AS employee_name
          FROM overtime_claims o
          JOIN employees e ON e.id = o.employee_id
          JOIN manageremployees me ON me.employeeid = o.employee_id AND me.managerid = $1
          WHERE o.status = 'pending'
          ORDER BY o.created_at ASC
        `,
        [req.user.id]
      ),
    ]);
    return res.json({ reimbursements: reimb.rows, overtime: ot.rows });
  } catch (err) {
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** PUT /api/payroll/reimbursements/:id/review */
router.put('/reimbursements/:id/review', requireRoles('manager', 'admin', 'founder'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const status = String(req.body?.status || '').toLowerCase();
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'status must be approved or rejected' });
    }
    const { rows } = await pool.query(`SELECT * FROM reimbursements WHERE id = $1`, [id]);
    const row = rows[0];
    if (!row) return res.status(404).json({ message: 'Not found' });
    await pool.query(
      `UPDATE reimbursements SET status = $2, approved_by = $3, approved_at = NOW() WHERE id = $1`,
      [id, status, req.user.id]
    );
    await createNotification(row.employee_id, 'payroll_reimbursement', `Your reimbursement was ${status}.`, {
      subjectEmployeeId: row.employee_id,
    });
    return res.json({ message: `Reimbursement ${status}` });
  } catch (err) {
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** PUT /api/payroll/overtime/:id/review */
router.put('/overtime/:id/review', requireRoles('manager', 'admin', 'founder'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const status = String(req.body?.status || '').toLowerCase();
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'status must be approved or rejected' });
    }
    const { rows } = await pool.query(`SELECT * FROM overtime_claims WHERE id = $1`, [id]);
    const row = rows[0];
    if (!row) return res.status(404).json({ message: 'Not found' });
    await pool.query(
      `UPDATE overtime_claims SET status = $2, approved_by = $3, approved_at = NOW() WHERE id = $1`,
      [id, status, req.user.id]
    );
    return res.json({ message: `Overtime ${status}` });
  } catch (err) {
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** GET /api/payroll/admin/runs */
router.get('/admin/runs', requirePortalAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM payroll_runs ORDER BY period_year DESC, period_month DESC`);
    return res.json({ runs: rows });
  } catch (err) {
    console.error('GET /payroll/admin/runs:', err.message);
    return res.status(500).json({ message: 'Could not load payroll runs' });
  }
});
router.post('/admin/runs', requirePortalAdmin, async (req, res) => {
  try {
    const month = Number(req.body?.month) || new Date().getMonth() + 1;
    const year = Number(req.body?.year) || new Date().getFullYear();
    const existing = await pool.query(
      `SELECT id FROM payroll_runs WHERE period_month = $1 AND period_year = $2`,
      [month, year]
    );
    if (existing.rows[0]) {
      return res.status(409).json({ message: 'Payroll run already exists for this period', runId: existing.rows[0].id });
    }

    const { rows: employees } = await pool.query(
      `SELECT id FROM employees WHERE COALESCE(is_active, TRUE) = TRUE`
    );

    const runRes = await pool.query(
      `INSERT INTO payroll_runs (period_month, period_year, status, initiated_by) VALUES ($1, $2, 'draft', $3) RETURNING *`,
      [month, year, req.user.id]
    );
    const run = runRes.rows[0];
    let totalNet = 0;

    for (const emp of employees.rows) {
      const calc = await computeEmployeePayroll(emp.id, month, year);
      await pool.query(
        `
          INSERT INTO payroll_items (
            payroll_run_id, employee_id, basic, hra, allowances, gross,
            lop_days, lop_deduction, pf, esi, tds, reimbursements, bonus,
            performance_bonus, net_pay, breakdown
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb)
        `,
        [
          run.id,
          emp.id,
          calc.basic,
          calc.hra,
          calc.allowances,
          calc.gross,
          calc.lopDays,
          calc.lopDeduction,
          calc.pf,
          calc.esi,
          calc.tds,
          calc.reimbursements,
          calc.bonus,
          calc.performanceBonus,
          calc.netPay,
          JSON.stringify(calc.breakdown),
        ]
      );
      totalNet += calc.netPay;
    }

    await pool.query(
      `UPDATE payroll_runs SET total_employees = $2, total_net = $3 WHERE id = $1`,
      [run.id, employees.rows.length, totalNet]
    );

    return res.status(201).json({ runId: run.id, employeeCount: employees.rows.length, totalNet });
  } catch (err) {
    console.error('POST /payroll/admin/runs:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** GET /api/payroll/admin/runs/:id */
router.get('/admin/runs/:id', requirePortalAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const run = await pool.query(`SELECT * FROM payroll_runs WHERE id = $1`, [id]);
    if (!run.rows[0]) return res.status(404).json({ message: 'Run not found' });
    const items = await pool.query(
      `
        SELECT pi.*, e.name, e.employeecode
        FROM payroll_items pi
        JOIN employees e ON e.id = pi.employee_id
        WHERE pi.payroll_run_id = $1
        ORDER BY e.name ASC
      `,
      [id]
    );
    return res.json({
      run: run.rows[0],
      items: items.rows.map((r) => ({ ...mapPayrollItem(r), employeeName: r.name, employeecode: r.employeecode })),
    });
  } catch (err) {
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** PATCH /api/payroll/admin/runs/:id/items/:itemId — manual correction */
router.patch('/admin/runs/:id/items/:itemId', requirePortalAdmin, async (req, res) => {
  try {
    const itemId = Number(req.params.itemId);
    const fields = ['bonus', 'tds', 'lop_deduction', 'performance_bonus'];
    const updates = [];
    const vals = [itemId];
    let idx = 2;
    for (const f of fields) {
      if (req.body?.[f] != null) {
        updates.push(`${f} = $${idx}`);
        vals.push(Number(req.body[f]));
        idx += 1;
      }
    }
    if (!updates.length) return res.status(400).json({ message: 'No fields to update' });
    await pool.query(`UPDATE payroll_items SET ${updates.join(', ')} WHERE id = $1`, vals);
    const item = await pool.query(`SELECT * FROM payroll_items WHERE id = $1`, [itemId]);
    const row = item.rows[0];
    const net =
      Number(row.gross) -
      Number(row.lop_deduction) -
      Number(row.pf) -
      Number(row.esi) -
      Number(row.tds) +
      Number(row.reimbursements) +
      Number(row.bonus) +
      Number(row.performance_bonus);
    await pool.query(`UPDATE payroll_items SET net_pay = $2 WHERE id = $1`, [itemId, net]);
    return res.json({ message: 'Item updated' });
  } catch (err) {
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** POST /api/payroll/admin/runs/:id/finalize */
router.post('/admin/runs/:id/finalize', requirePortalAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const runRes = await pool.query(`SELECT * FROM payroll_runs WHERE id = $1`, [id]);
    const run = runRes.rows[0];
    if (!run) return res.status(404).json({ message: 'Run not found' });
    if (run.status === 'finalized') return res.status(400).json({ message: 'Already finalized' });

    const items = await pool.query(
      `SELECT pi.*, e.name, e.employeecode, e.bank_account_number, e.bank_ifsc
       FROM payroll_items pi JOIN employees e ON e.id = pi.employee_id WHERE pi.payroll_run_id = $1`,
      [id]
    );

    for (const item of items.rows) {
      const url = await generatePayslipPdf(
        { id: item.employee_id, name: item.name, employeecode: item.employeecode },
        item,
        run
      );
      await pool.query(`UPDATE payroll_items SET payslip_url = $2 WHERE id = $1`, [item.id, url]);
      await createNotification(
        item.employee_id,
        'payroll_payslip',
        `Your payslip for ${run.period_month}/${run.period_year} is ready.`,
        { subjectEmployeeId: item.employee_id }
      );
    }

    const empMap = new Map(items.rows.map((r) => [r.employee_id, r]));
    const csv = generateBankCsv(items.rows, empMap);
    const bankDir = getUploadsRoot('payroll-bank');
    if (!fs.existsSync(bankDir)) fs.mkdirSync(bankDir, { recursive: true });
    const bankFile = `bank-${run.period_year}-${run.period_month}-${Date.now()}.csv`;
    fs.writeFileSync(path.join(bankDir, bankFile), csv);

    await pool.query(
      `UPDATE reimbursements SET payroll_run_id = $1 WHERE employee_id = ANY($2::int[]) AND status = 'approved' AND payroll_run_id IS NULL`,
      [id, items.rows.map((r) => r.employee_id)]
    );
    await pool.query(
      `UPDATE payroll_performance_bonuses SET payroll_run_id = $1 WHERE payroll_run_id IS NULL`,
      [id]
    );

    await pool.query(
      `UPDATE payroll_runs SET status = 'finalized', finalized_at = NOW(), bank_file_url = $2 WHERE id = $1`,
      [id, `/uploads/payroll-bank/${bankFile}`]
    );

    return res.json({ message: 'Payroll finalized', bankFileUrl: `/uploads/payroll-bank/${bankFile}` });
  } catch (err) {
    console.error('POST finalize:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** GET /api/payroll/admin/employee-setup — salary + bank for all active employees */
router.get('/admin/employee-setup', requirePortalAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `
        SELECT
          e.id, e.employeecode, e.name, e.department, e.designation,
          e.bank_account_name, e.bank_account_number, e.bank_ifsc,
          ss.id AS salary_structure_id, ss.basic, ss.hra, ss.special_allowance,
          ss.other_allowance, ss.annual_ctc, ss.pf_applicable, ss.esi_applicable, ss.effective_from
        FROM employees e
        LEFT JOIN LATERAL (
          SELECT * FROM salary_structures
          WHERE employee_id = e.id
          ORDER BY effective_from DESC
          LIMIT 1
        ) ss ON TRUE
        WHERE COALESCE(e.is_active, TRUE) = TRUE
        ORDER BY e.name ASC
      `
    );
    const employees = rows.map(mapEmployeeSetupRow);
    const summary = {
      total: employees.length,
      salaryConfigured: employees.filter((e) => e.salaryStructure.configured).length,
      bankConfigured: employees.filter((e) => e.bankConfigured).length,
    };
    return res.json({ employees, summary });
  } catch (err) {
    console.error('GET /payroll/admin/employee-setup:', err.message);
    return res.status(500).json({ message: 'Could not load employee payroll setup' });
  }
});

/** POST /api/payroll/admin/salary-structure */
router.post('/admin/salary-structure', requirePortalAdmin, async (req, res) => {
  try {
    const employeeId = Number(req.body?.employeeId);
    if (!Number.isFinite(employeeId)) return res.status(400).json({ message: 'employeeId required' });
    const structure = await upsertSalaryStructure(employeeId, req.body);
    return res.json({ structure: mapSalaryStructure(structure) });
  } catch (err) {
    console.error('POST /payroll/admin/salary-structure:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** PUT /api/payroll/admin/employees/:id/bank */
router.put('/admin/employees/:id/bank', requirePortalAdmin, async (req, res) => {
  try {
    const employeeId = Number(req.params.id);
    if (!Number.isFinite(employeeId)) return res.status(400).json({ message: 'Valid employee id required' });
    const exists = await pool.query(`SELECT id FROM employees WHERE id = $1`, [employeeId]);
    if (!exists.rows[0]) return res.status(404).json({ message: 'Employee not found' });
    await updateEmployeeBank(employeeId, req.body);
    return res.json({ message: 'Bank details saved' });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ message: err.message });
    console.error('PUT /payroll/admin/employees/:id/bank:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** PUT /api/payroll/admin/employees/:id/setup — salary + bank in one save */
router.put('/admin/employees/:id/setup', requirePortalAdmin, async (req, res) => {
  try {
    const employeeId = Number(req.params.id);
    if (!Number.isFinite(employeeId)) return res.status(400).json({ message: 'Valid employee id required' });
    const exists = await pool.query(`SELECT id FROM employees WHERE id = $1`, [employeeId]);
    if (!exists.rows[0]) return res.status(404).json({ message: 'Employee not found' });

    const structure = await upsertSalaryStructure(employeeId, req.body?.salary || req.body);
    const bankPayload = req.body?.bank || req.body;
    const hasBank =
      bankPayload?.bankAccountNumber ||
      bankPayload?.bank_account_number ||
      bankPayload?.bankIfsc ||
      bankPayload?.bank_ifsc;
    if (hasBank) {
      await updateEmployeeBank(employeeId, bankPayload);
    }

    const { rows } = await pool.query(
      `
        SELECT
          e.id, e.employeecode, e.name, e.department, e.designation,
          e.bank_account_name, e.bank_account_number, e.bank_ifsc,
          ss.id AS salary_structure_id, ss.basic, ss.hra, ss.special_allowance,
          ss.other_allowance, ss.annual_ctc, ss.pf_applicable, ss.esi_applicable, ss.effective_from
        FROM employees e
        LEFT JOIN LATERAL (
          SELECT * FROM salary_structures
          WHERE employee_id = e.id
          ORDER BY effective_from DESC
          LIMIT 1
        ) ss ON TRUE
        WHERE e.id = $1
      `,
      [employeeId]
    );
    return res.json({ employee: mapEmployeeSetupRow(rows[0]) });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ message: err.message });
    console.error('PUT /payroll/admin/employees/:id/setup:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** POST /api/payroll/admin/employee-setup/import — CSV bulk upload */
router.post('/admin/employee-setup/import', requirePortalAdmin, async (req, res) => {
  try {
    const csv = String(req.body?.csv || '').trim();
    if (!csv) return res.status(400).json({ message: 'CSV content required' });

    const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      return res.status(400).json({ message: 'CSV must include a header row and at least one employee row' });
    }

    const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
    const idx = (name) => header.indexOf(name);
    const codeIdx = idx('employeecode') >= 0 ? idx('employeecode') : idx('employee_code');
    if (codeIdx < 0) {
      return res.status(400).json({ message: 'CSV must include employeecode column' });
    }

    const { rows: allEmployees } = await pool.query(
      `SELECT id, employeecode FROM employees WHERE COALESCE(is_active, TRUE) = TRUE`
    );
    const byCode = new Map(
      allEmployees.map((e) => [String(e.employeecode || '').trim().toLowerCase(), e.id])
    );

    const results = { updated: 0, skipped: 0, errors: [] };

    for (let i = 1; i < lines.length; i += 1) {
      const cols = parseCsvLine(lines[i]);
      const code = String(cols[codeIdx] || '').trim().toLowerCase();
      const codeDisplay = String(cols[codeIdx] || '').trim();
      if (!code) {
        results.skipped += 1;
        pushImportError(results, { line: i + 1, employeecode: null, employeeId: null, message: 'Missing employeecode' });
        continue;
      }
      const employeeId = byCode.get(code);
      if (!employeeId) {
        results.skipped += 1;
        pushImportError(results, {
          line: i + 1,
          employeecode: codeDisplay,
          employeeId: null,
          message: `No active employee found with employeecode "${codeDisplay}"`,
        });
        continue;
      }

      const pick = (key) => {
        const j = idx(key);
        return j >= 0 ? cols[j] : '';
      };

      try {
        const annualCtc = Number(pick('annual_ctc') || pick('ctc') || 0);
        const basic = Number(pick('basic') || 0);
        const hra = Number(pick('hra') || 0);
        const special = Number(pick('special_allowance') || 0);
        const other = Number(pick('other_allowance') || 0);

        if (annualCtc > 0 || basic > 0 || hra > 0) {
          await upsertSalaryStructure(employeeId, {
            annualCtc,
            basic,
            hra,
            specialAllowance: special,
            otherAllowance: other,
            pfApplicable: pick('pf_applicable') !== 'false' && pick('pf_applicable') !== '0',
            esiApplicable: pick('esi_applicable') !== 'false' && pick('esi_applicable') !== '0',
          });
        }

        const bankNumber = pick('bank_account_number') || pick('account_number');
        const bankIfsc = pick('bank_ifsc') || pick('ifsc');
        if (bankNumber && bankIfsc) {
          await updateEmployeeBank(employeeId, {
            bankAccountName: pick('bank_account_name') || pick('account_name'),
            bankAccountNumber: bankNumber,
            bankIfsc,
          });
        }

        results.updated += 1;
      } catch (e) {
        results.skipped += 1;
        pushImportError(results, {
          line: i + 1,
          employeecode: codeDisplay,
          employeeId,
          message: e.message || 'Row failed',
        });
      }
    }

    return res.json(results);
  } catch (err) {
    console.error('POST /payroll/admin/employee-setup/import:', err.message);
    return res.status(500).json({ message: 'Import failed' });
  }
});

/** POST /api/payroll/admin/fnf/:exitRequestId — Full & Final after clearances */
router.post('/admin/fnf/:exitRequestId', requirePortalAdmin, async (req, res) => {
  try {
    const exitRequestId = Number(req.params.exitRequestId);
    if (!(await allClearancesApproved(exitRequestId))) {
      return res.status(400).json({ message: 'All exit clearances must be approved before F&F' });
    }
    const exitRes = await pool.query(`SELECT * FROM exit_requests WHERE id = $1`, [exitRequestId]);
    const exitRow = exitRes.rows[0];
    if (!exitRow) return res.status(404).json({ message: 'Exit not found' });

    const month = new Date().getMonth() + 1;
    const year = new Date().getFullYear();
    const calc = await computeEmployeePayroll(exitRow.employee_id, month, year);
    const earnings = {
      basic: calc.basic,
      hra: calc.hra,
      allowances: calc.allowances,
      reimbursements: calc.reimbursements,
      performanceBonus: calc.performanceBonus,
      leaveEncashment: 0,
    };
    const deductions = {
      lop: calc.lopDeduction,
      pf: calc.pf,
      esi: calc.esi,
      tds: calc.tds,
    };
    const net = calc.netPay;

    const { rows } = await pool.query(
      `
        INSERT INTO fnf_settlements (exit_request_id, employee_id, earnings, deductions, net_settlement, status, generated_at)
        VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, 'draft', NOW())
        ON CONFLICT (exit_request_id) DO UPDATE SET
          earnings = EXCLUDED.earnings,
          deductions = EXCLUDED.deductions,
          net_settlement = EXCLUDED.net_settlement,
          generated_at = NOW()
        RETURNING *
      `,
      [exitRequestId, exitRow.employee_id, JSON.stringify(earnings), JSON.stringify(deductions), net]
    );
    await createNotification(
      exitRow.employee_id,
      'payroll_fnf',
      'Your Full & Final settlement has been computed. HR will finalize shortly.',
      { subjectEmployeeId: exitRow.employee_id }
    );
    return res.json({ settlement: rows[0] });
  } catch (err) {
    console.error('POST fnf:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** GET /api/payroll/admin/queries */
router.get('/admin/queries', requirePortalAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `
        SELECT q.*, e.name AS employee_name
        FROM payroll_queries q
        JOIN employees e ON e.id = q.employee_id
        WHERE q.status = 'open'
        ORDER BY q.created_at ASC
      `
    );
    return res.json({ queries: rows });
  } catch (err) {
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** PUT /api/payroll/admin/queries/:id */
router.put('/admin/queries/:id', requirePortalAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const response = String(req.body?.response || '').trim();
    await pool.query(
      `UPDATE payroll_queries SET status = 'resolved', admin_response = $2, resolved_at = NOW() WHERE id = $1`,
      [id, response]
    );
    return res.json({ message: 'Query resolved' });
  } catch (err) {
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
