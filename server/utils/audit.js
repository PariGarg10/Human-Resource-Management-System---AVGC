const { pool } = require('../db');

async function logAudit(actorId, action, resource, details) {
  await pool.query(
    'INSERT INTO auditlogs (actorid, action, resource, details) VALUES ($1, $2, $3, $4)',
    [actorId || null, action, resource, details ? JSON.stringify(details) : null]
  );
}

module.exports = { logAudit };
