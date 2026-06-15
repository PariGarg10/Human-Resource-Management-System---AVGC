const { pool } = require('../db');

async function ensurePayrollSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS salary_structures (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
      basic NUMERIC(12,2) NOT NULL DEFAULT 0,
      hra NUMERIC(12,2) NOT NULL DEFAULT 0,
      special_allowance NUMERIC(12,2) NOT NULL DEFAULT 0,
      other_allowance NUMERIC(12,2) NOT NULL DEFAULT 0,
      pf_applicable BOOLEAN NOT NULL DEFAULT TRUE,
      esi_applicable BOOLEAN NOT NULL DEFAULT TRUE,
      annual_ctc NUMERIC(14,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (employee_id, effective_from)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS payroll_runs (
      id SERIAL PRIMARY KEY,
      period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
      period_year INTEGER NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'draft',
      initiated_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      finalized_at TIMESTAMPTZ,
      total_employees INTEGER NOT NULL DEFAULT 0,
      total_net NUMERIC(14,2) NOT NULL DEFAULT 0,
      bank_file_url TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (period_month, period_year)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS payroll_items (
      id SERIAL PRIMARY KEY,
      payroll_run_id INTEGER NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      basic NUMERIC(12,2) NOT NULL DEFAULT 0,
      hra NUMERIC(12,2) NOT NULL DEFAULT 0,
      allowances NUMERIC(12,2) NOT NULL DEFAULT 0,
      gross NUMERIC(12,2) NOT NULL DEFAULT 0,
      lop_days NUMERIC(6,2) NOT NULL DEFAULT 0,
      lop_deduction NUMERIC(12,2) NOT NULL DEFAULT 0,
      pf NUMERIC(12,2) NOT NULL DEFAULT 0,
      esi NUMERIC(12,2) NOT NULL DEFAULT 0,
      tds NUMERIC(12,2) NOT NULL DEFAULT 0,
      reimbursements NUMERIC(12,2) NOT NULL DEFAULT 0,
      bonus NUMERIC(12,2) NOT NULL DEFAULT 0,
      performance_bonus NUMERIC(12,2) NOT NULL DEFAULT 0,
      net_pay NUMERIC(12,2) NOT NULL DEFAULT 0,
      payslip_url TEXT,
      breakdown JSONB,
      UNIQUE (payroll_run_id, employee_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reimbursements (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
      description TEXT,
      expense_date DATE,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      approved_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      approved_at TIMESTAMPTZ,
      payroll_run_id INTEGER REFERENCES payroll_runs(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS overtime_claims (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      claim_date DATE NOT NULL,
      hours NUMERIC(5,2) NOT NULL CHECK (hours > 0),
      reason TEXT,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      approved_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      approved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tax_declarations (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      financial_year TEXT NOT NULL,
      regime VARCHAR(20) NOT NULL DEFAULT 'new',
      section_80c NUMERIC(12,2) NOT NULL DEFAULT 0,
      section_80d NUMERIC(12,2) NOT NULL DEFAULT 0,
      hra_exemption NUMERIC(12,2) NOT NULL DEFAULT 0,
      other_declarations JSONB,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (employee_id, financial_year)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS fnf_settlements (
      id SERIAL PRIMARY KEY,
      exit_request_id INTEGER NOT NULL UNIQUE REFERENCES exit_requests(id) ON DELETE CASCADE,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      earnings JSONB NOT NULL DEFAULT '{}',
      deductions JSONB NOT NULL DEFAULT '{}',
      net_settlement NUMERIC(14,2) NOT NULL DEFAULT 0,
      status VARCHAR(50) NOT NULL DEFAULT 'draft',
      payslip_url TEXT,
      generated_at TIMESTAMPTZ,
      finalized_at TIMESTAMPTZ
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS payroll_queries (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      payroll_item_id INTEGER REFERENCES payroll_items(id) ON DELETE SET NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'open',
      admin_response TEXT,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS payroll_performance_bonuses (
      id SERIAL PRIMARY KEY,
      payroll_run_id INTEGER REFERENCES payroll_runs(id) ON DELETE SET NULL,
      performance_cycle_id INTEGER,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      increment_pct NUMERIC(6,2) NOT NULL DEFAULT 0,
      bonus_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query('ALTER TABLE reimbursements ADD COLUMN IF NOT EXISTS receipt_url TEXT');
}

module.exports = { ensurePayrollSchema };
