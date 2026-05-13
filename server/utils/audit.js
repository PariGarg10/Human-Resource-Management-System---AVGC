const { db } = require('../db');

function logAudit(actorId, action, resource, details) {
  db.prepare(
    'INSERT INTO auditlogs (actorid, action, resource, details) VALUES (?, ?, ?, ?)'
  ).run(actorId || null, action, resource, details ? JSON.stringify(details) : null);
}

module.exports = { logAudit };
