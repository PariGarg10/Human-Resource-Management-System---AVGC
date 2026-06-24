const express = require('express');
const { pool } = require('../db');
const { authMiddleware, enforceForcePasswordChange, requireAnyAdmin } = require('../middleware/auth');
const {
  ensureSocialTournamentTables,
  isPortalAdminUser,
  parseGameId,
  mapTournament,
  pickBestScore,
} = require('../utils/socialTournaments');

const router = express.Router();

router.use(authMiddleware);
router.use(enforceForcePasswordChange);

router.get('/', async (req, res) => {
  try {
    await ensureSocialTournamentTables();
    const result = await pool.query(
      `
        SELECT id, game_id, title, status, started_at, ends_at, ended_at, created_at,
               winner_employee_id, winner_name, winner_score
        FROM social_tournaments
        WHERE status = 'active'
        ORDER BY created_at DESC
      `
    );
    const tournaments = result.rows.map((r) => mapTournament(r));
    const myScores = await pool.query(
      `
        SELECT tournament_id, score
        FROM social_tournament_scores
        WHERE employee_id = $1
      `,
      [req.user.id]
    );
    const scoreMap = {};
    for (const row of myScores.rows) {
      scoreMap[String(row.tournament_id)] = row.score;
    }
    return res.json({ tournaments, myScores: scoreMap });
  } catch (err) {
    console.error('GET /social-tournaments:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/manage-access', async (req, res) => {
  try {
    if (!req.user) return res.json({ allowed: false });
    if (req.user.adminId) return res.json({ allowed: true });
    const role = String(req.user.role || '').toLowerCase().trim();
    if (isPortalAdminUser(req.user)) return res.json({ allowed: true });
    const { rows } = await pool.query(
      'SELECT id FROM admins WHERE employee_id = $1 AND is_active = TRUE LIMIT 1',
      [req.user.id]
    );
    return res.json({ allowed: Boolean(rows[0]) });
  } catch (err) {
    console.error('GET /social-tournaments/manage-access:', err.message);
    return res.json({ allowed: false });
  }
});

router.get('/admin', requireAnyAdmin, async (_req, res) => {
  try {
    await ensureSocialTournamentTables();
    const result = await pool.query(
      `
        SELECT id, game_id, title, status, started_at, ends_at, ended_at, created_at,
               winner_employee_id, winner_name, winner_score
        FROM social_tournaments
        ORDER BY created_at DESC
        LIMIT 50
      `
    );
    const tournaments = [];
    for (const row of result.rows) {
      const t = mapTournament(row, { includeWinner: true });
      const scores = await pool.query(
        `
          SELECT employee_id, employee_name, score, created_at
          FROM social_tournament_scores
          WHERE tournament_id = $1
          ORDER BY score DESC
        `,
        [row.id]
      );
      t.leaderboard = scores.rows.map((s) => ({
        employeeId: s.employee_id,
        name: s.employee_name,
        score: s.score,
        at: new Date(s.created_at).getTime(),
      }));
      if (row.game_id === 'minesweeper' || row.game_id === 'memory') {
        t.leaderboard.sort((a, b) => a.score - b.score);
      }
      tournaments.push(t);
    }
    return res.json({ tournaments });
  } catch (err) {
    console.error('GET /social-tournaments/admin:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/', requireAnyAdmin, async (req, res) => {
  try {
    await ensureSocialTournamentTables();
    const gameId = parseGameId(req.body?.gameId);
    const title = String(req.body?.title || '').trim();
    if (!gameId) return res.status(400).json({ message: 'Invalid game' });
    if (!title) return res.status(400).json({ message: 'Tournament title is required' });

    const endsAt = req.body?.endsAt ? new Date(req.body.endsAt) : null;
    const ins = await pool.query(
      `
        INSERT INTO social_tournaments (game_id, title, created_by, ends_at)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `,
      [gameId, title, req.user.id, endsAt && !Number.isNaN(endsAt.getTime()) ? endsAt : null]
    );
    return res.status(201).json({ tournament: mapTournament(ins.rows[0]) });
  } catch (err) {
    console.error('POST /social-tournaments:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/:id/scores', async (req, res) => {
  try {
    await ensureSocialTournamentTables();
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id' });

    const score = Number(req.body?.score);
    if (!Number.isFinite(score)) return res.status(400).json({ message: 'Score is required' });

    const tRes = await pool.query('SELECT * FROM social_tournaments WHERE id = $1', [id]);
    const tournament = tRes.rows[0];
    if (!tournament) return res.status(404).json({ message: 'Tournament not found' });
    if (tournament.status !== 'active') {
      return res.status(400).json({ message: 'Tournament has ended' });
    }

    const name = String(req.user.name || 'Player').trim();
    const lowerIsBetter = tournament.game_id === 'minesweeper' || tournament.game_id === 'memory';
    const existing = await pool.query(
      `SELECT score FROM social_tournament_scores WHERE tournament_id = $1 AND employee_id = $2`,
      [id, req.user.id]
    );
    if (existing.rows[0]) {
      const prev = Number(existing.rows[0].score);
      const better = lowerIsBetter ? score < prev : score > prev;
      if (better) {
        await pool.query(
          `UPDATE social_tournament_scores SET score = $3, employee_name = $4, created_at = NOW() WHERE tournament_id = $1 AND employee_id = $2`,
          [id, req.user.id, score, name]
        );
      }
    } else {
      await pool.query(
        `INSERT INTO social_tournament_scores (tournament_id, employee_id, employee_name, score) VALUES ($1, $2, $3, $4)`,
        [id, req.user.id, name, score]
      );
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('POST /social-tournaments/:id/scores:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.patch('/:id/end', requireAnyAdmin, async (req, res) => {
  try {
    await ensureSocialTournamentTables();
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id' });

    const tRes = await pool.query('SELECT * FROM social_tournaments WHERE id = $1', [id]);
    const tournament = tRes.rows[0];
    if (!tournament) return res.status(404).json({ message: 'Tournament not found' });
    if (tournament.status === 'ended') {
      return res.status(400).json({ message: 'Tournament already ended' });
    }

    const best = await pickBestScore(id, tournament.game_id);
    const upd = await pool.query(
      `
        UPDATE social_tournaments
        SET status = 'ended',
            ended_at = NOW(),
            winner_employee_id = $2,
            winner_name = $3,
            winner_score = $4
        WHERE id = $1
        RETURNING *
      `,
      [id, best?.employee_id || null, best?.employee_name || null, best?.score ?? null]
    );

    return res.json({
      tournament: mapTournament(upd.rows[0], { includeWinner: true }),
      winner: best
        ? { name: best.employee_name, score: best.score, employeeId: best.employee_id }
        : null,
    });
  } catch (err) {
    console.error('PATCH /social-tournaments/:id/end:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/active/:gameId', async (req, res) => {
  try {
    await ensureSocialTournamentTables();
    const gameId = parseGameId(req.params.gameId);
    if (!gameId) return res.status(400).json({ message: 'Invalid game' });
    const result = await pool.query(
      `
        SELECT id, game_id, title, status, started_at, ends_at
        FROM social_tournaments
        WHERE status = 'active' AND game_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [gameId]
    );
    return res.json({
      tournament: result.rows[0] ? mapTournament(result.rows[0]) : null,
    });
  } catch (err) {
    console.error('GET /social-tournaments/active/:gameId:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
