/**
 * Efficiency baseline seed — DO NOT RUN until project names/IDs are confirmed.
 *
 * Usage (after confirmation):
 *   CONFIRM_EFFICIENCY_SEED=yes node server/scripts/seed-efficiency-baselines.js
 *
 * Edit server/data/efficiency-baseline-seed.template.json with your confirmed
 * project names and standard rates before running.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../db');
const { computeManhoursPerUnit } = require('../utils/efficiencyMetrics');

const TEMPLATE_PATH = path.join(
  __dirname,
  '../data',
  process.env.EFFICIENCY_SEED_FILE || 'efficiency-baseline-seed.json'
);

async function main() {
  if (process.env.CONFIRM_EFFICIENCY_SEED !== 'yes') {
    console.error(
      'Refusing to seed: set CONFIRM_EFFICIENCY_SEED=yes after confirming project mapping in the template JSON.'
    );
    process.exit(1);
  }
  if (!fs.existsSync(TEMPLATE_PATH)) {
    console.error('Missing template:', TEMPLATE_PATH);
    process.exit(1);
  }

  const payload = JSON.parse(fs.readFileSync(TEMPLATE_PATH, 'utf8'));
  if (payload.confirmed !== true) {
    console.error('Set "confirmed": true in the template JSON after you verify project names and rates.');
    process.exit(1);
  }

  let inserted = 0;
  for (const project of payload.projects || []) {
    const name = String(project.name || '').trim();
    if (!name) continue;

    const projRes = await pool.query(
      `
        INSERT INTO efficiency_projects (name)
        VALUES ($1)
        ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
        RETURNING id, name
      `,
      [name]
    );
    const projectId = projRes.rows[0].id;
    const projectName = projRes.rows[0].name;

    for (const task of project.tasks || []) {
      const calcType = String(task.calcType || 'rate_based');
      const manhoursPerUnit = computeManhoursPerUnit({
        calcType,
        standardHours: task.standardHours,
        standardOutputQty: task.standardOutputQty,
        manhoursPerUnit: task.manhoursPerUnit,
      });

      await pool.query(
        `
          INSERT INTO task_baselines (
            project_id, project_name, task_name, version_label, unit_label,
            standard_output_qty, standard_hours, calc_type, manhours_per_unit
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (project_id, task_name, version_label)
          DO UPDATE SET
            unit_label = EXCLUDED.unit_label,
            standard_output_qty = EXCLUDED.standard_output_qty,
            standard_hours = EXCLUDED.standard_hours,
            calc_type = EXCLUDED.calc_type,
            manhours_per_unit = EXCLUDED.manhours_per_unit
        `,
        [
          projectId,
          projectName,
          task.taskName,
          task.versionLabel || '',
          task.unitLabel || 'unit',
          calcType === 'rate_based' ? task.standardOutputQty : null,
          calcType === 'rate_based' ? task.standardHours : null,
          calcType,
          manhoursPerUnit,
        ]
      );
      inserted += 1;
    }
  }

  console.log(`Seeded/updated ${inserted} task baselines across ${payload.projects.length} projects.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
