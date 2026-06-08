const { pool } = require('../db');
const { isAdminRole } = require('../constants/roles');
const { isFounderUser } = require('../middleware/auth');

const VALID_GAMES = ['minesweeper', 'hangman', 'whack'];

let tableReady = false;

async function ensureSocialTournamentTables() {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS social_tournaments (
      id SERIAL PRIMARY KEY,
      game_id TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
      created_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      winner_employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      winner_name TEXT,
      winner_score DOUBLE PRECISION,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ends_at TIMESTAMPTZ,
      ended_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS social_tournament_scores (
      id SERIAL PRIMARY KEY,
      tournament_id INTEGER NOT NULL REFERENCES social_tournaments(id) ON DELETE CASCADE,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      employee_name TEXT NOT NULL,
      score DOUBLE PRECISION NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tournament_id, employee_id)
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_social_tournaments_status ON social_tournaments (status, game_id)`
  );
  tableReady = true;
}

function isPortalAdminUser(user) {
  if (!user) return false;
  if (user.adminId) return true;
  const role = String(user.role || '').toLowerCase().trim();
  return isAdminRole(role) || isFounderUser(user);
}

function parseGameId(value) {
  const id = String(value || '').trim().toLowerCase();
  return VALID_GAMES.includes(id) ? id : null;
}

function mapTournament(row, { includeWinner = false } = {}) {
  const base = {
    id: String(row.id),
    gameId: row.game_id,
    title: row.title,
    status: row.status,
    startedAt: new Date(row.started_at).getTime(),
    endsAt: row.ends_at ? new Date(row.ends_at).getTime() : null,
    endedAt: row.ended_at ? new Date(row.ended_at).getTime() : null,
    createdAt: new Date(row.created_at).getTime(),
  };
  if (includeWinner && row.status === 'ended') {
    base.winner = row.winner_name
      ? { name: row.winner_name, score: row.winner_score, employeeId: row.winner_employee_id }
      : null;
  }
  return base;
}

async function pickBestScore(tournamentId, gameId) {
  const scoreMode = gameId === 'minesweeper' || gameId === 'memory' ? 'lower' : 'higher';
  const order = scoreMode === 'higher' ? 'DESC' : 'ASC';
  const result = await pool.query(
    `
      SELECT employee_id, employee_name, score
      FROM social_tournament_scores
      WHERE tournament_id = $1
      ORDER BY score ${order}, created_at ASC
      LIMIT 1
    `,
    [tournamentId]
  );
  return result.rows[0] || null;
}

module.exports = {
  VALID_GAMES,
  ensureSocialTournamentTables,
  isPortalAdminUser,
  parseGameId,
  mapTournament,
  pickBestScore,
};
