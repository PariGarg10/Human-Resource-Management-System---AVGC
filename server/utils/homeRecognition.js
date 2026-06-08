const { pool } = require('../db');

const CATEGORIES = Object.freeze(['top_performer', 'team_lead', 'employee']);

let tableReady = false;

async function ensureHomeRecognitionTable() {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS homepage_recognition (
      id SERIAL PRIMARY KEY,
      category TEXT NOT NULL CHECK (category IN ('top_performer', 'team_lead', 'employee')),
      name TEXT NOT NULL,
      designation TEXT NOT NULL,
      image_url TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_visible BOOLEAN NOT NULL DEFAULT TRUE,
      uploaded_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE homepage_recognition DROP CONSTRAINT IF EXISTS homepage_recognition_category_check;
    EXCEPTION
      WHEN undefined_object THEN NULL;
    END $$;
  `);
  await pool.query(`
    ALTER TABLE homepage_recognition
    ADD CONSTRAINT homepage_recognition_category_check
    CHECK (category IN ('top_performer', 'team_lead', 'employee'))
  `).catch(() => {});
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_homepage_recognition_category
     ON homepage_recognition (category, is_visible, sort_order, created_at)`
  );
  tableReady = true;
}

function mapRow(row) {
  return {
    id: row.id,
    category: row.category,
    name: row.name,
    designation: row.designation,
    image: row.image_url || null,
    imageUrl: row.image_url || null,
    sortOrder: row.sort_order,
    isVisible: row.is_visible,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = {
  CATEGORIES,
  ensureHomeRecognitionTable,
  mapRow,
};
