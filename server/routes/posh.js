const express = require('express');
const { pool } = require('../db');
const { authMiddleware, enforceForcePasswordChange } = require('../middleware/auth');
const { ensureOnboardingTasks, checkAndCompleteOnboarding } = require('../utils/onboardingHelpers');

const router = express.Router();
router.use(authMiddleware);
router.use(enforceForcePasswordChange);

const PASS_MARK = 4;

function youtubeEmbedUrl(url) {
  if (!url) return null;
  const u = String(url).trim();
  const watch = u.match(/[?&]v=([^&]+)/);
  if (watch) return `https://www.youtube.com/embed/${watch[1]}`;
  const short = u.match(/youtu\.be\/([^?]+)/);
  if (short) return `https://www.youtube.com/embed/${short[1]}`;
  if (u.includes('youtube.com/embed/')) return u;
  return u;
}

/** GET /api/posh/quiz */
router.get('/quiz', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `
        SELECT id, question, option_a, option_b, option_c, option_d, sort_order
        FROM posh_quiz_questions
        WHERE is_active = TRUE
        ORDER BY sort_order ASC, id ASC
        LIMIT 5
      `
    );
    const videoRes = await pool.query(`SELECT video_url FROM posh_config WHERE id = 1`);
    return res.json({
      questions: rows.map((r) => ({
        id: r.id,
        question: r.question,
        options: {
          a: r.option_a,
          b: r.option_b,
          c: r.option_c,
          d: r.option_d,
        },
      })),
      videoUrl: videoRes.rows[0]?.video_url || null,
      embedUrl: youtubeEmbedUrl(videoRes.rows[0]?.video_url),
      passMark: PASS_MARK,
    });
  } catch (err) {
    console.error('GET /posh/quiz:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** POST /api/posh/submit */
router.post('/submit', async (req, res) => {
  try {
    const employeeId = Number(req.body?.employeeId || req.user.id);
    const answers = Array.isArray(req.body?.answers) ? req.body.answers : [];

    if (employeeId !== req.user.id) {
      return res.status(403).json({ message: 'You can only submit your own quiz' });
    }

    const { rows: questions } = await pool.query(
      `
        SELECT id, correct_option
        FROM posh_quiz_questions
        WHERE is_active = TRUE
        ORDER BY sort_order ASC, id ASC
        LIMIT 5
      `
    );

    if (questions.length < 5) {
      return res.status(400).json({ message: 'POSH quiz is not configured yet. Contact HR.' });
    }

    let score = 0;
    const graded = questions.map((q, idx) => {
      const given = String(answers[idx] || '').toLowerCase();
      const correct = given === String(q.correct_option).toLowerCase();
      if (correct) score += 1;
      return { questionId: q.id, answer: given, correct };
    });

    const passed = score >= PASS_MARK;

    await pool.query(
      `
        INSERT INTO posh_quiz_attempts (employee_id, score, passed, answers)
        VALUES ($1, $2, $3, $4::jsonb)
      `,
      [employeeId, score, passed, JSON.stringify(graded)]
    );

    if (passed) {
      await ensureOnboardingTasks(employeeId);
      await pool.query(
        `
          UPDATE onboarding_tasks
          SET status = 'completed', completed_at = NOW(),
              meta = jsonb_build_object('score', $2::int)
          WHERE employee_id = $1 AND task_key = 'posh_training'
        `,
        [employeeId, score]
      );
      await checkAndCompleteOnboarding(employeeId);
    }

    return res.json({ passed, score, total: questions.length, passMark: PASS_MARK });
  } catch (err) {
    console.error('POST /posh/submit:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
