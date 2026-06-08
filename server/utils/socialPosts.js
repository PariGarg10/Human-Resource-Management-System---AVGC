const { pool } = require('../db');
const { isAdminRole } = require('../constants/roles');
const { isFounderUser } = require('../middleware/auth');

let tableReady = false;

async function ensureSocialPostsTables() {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS social_posts (
      id SERIAL PRIMARY KEY,
      channel TEXT NOT NULL CHECK (channel IN ('artwork', 'board')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      author_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      author_name TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      caption TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      media_url TEXT NOT NULL DEFAULT '',
      media_type TEXT NOT NULL DEFAULT 'text',
      reject_reason TEXT,
      reactions JSONB NOT NULL DEFAULT '{}',
      comments JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS social_post_user_reactions (
      post_id INTEGER NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      emoji TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (post_id, employee_id, emoji)
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_social_posts_status ON social_posts (status, created_at DESC)`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_social_posts_author ON social_posts (author_id, created_at DESC)`
  );
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE social_posts DROP CONSTRAINT IF EXISTS social_posts_channel_check;
    EXCEPTION
      WHEN undefined_object THEN NULL;
    END $$;
  `);
  await pool.query(`
    ALTER TABLE social_posts
    ADD CONSTRAINT social_posts_channel_check
    CHECK (channel IN ('artwork', 'board', 'gaming'))
  `).catch(() => {});
  tableReady = true;
}

function isPortalAdminUser(user) {
  if (!user) return false;
  if (user.adminId) return true;
  const role = String(user.role || '').toLowerCase().trim();
  return isAdminRole(role) || isFounderUser(user);
}

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function mapPostRow(row, userReactions = {}) {
  return {
    id: String(row.id),
    channel: row.channel,
    status: row.status,
    author: row.author_name,
    authorId: row.author_id,
    title: row.title || '',
    caption: row.caption || '',
    category: row.category || '',
    mediaUrl: row.media_url || '',
    mediaType: row.media_type || 'text',
    rejectReason: row.reject_reason || undefined,
    createdAt: new Date(row.created_at).getTime(),
    reactions: parseJson(row.reactions, {}),
    userReactions: userReactions,
    comments: parseJson(row.comments, []),
  };
}

async function loadUserReactionsForPosts(postIds, employeeId) {
  if (!postIds.length || !employeeId) return {};
  const result = await pool.query(
    `
      SELECT post_id, emoji
      FROM social_post_user_reactions
      WHERE employee_id = $1 AND post_id = ANY($2::int[])
    `,
    [employeeId, postIds]
  );
  const map = {};
  for (const row of result.rows) {
    const key = String(row.post_id);
    if (!map[key]) map[key] = {};
    map[key][row.emoji] = true;
  }
  return map;
}

async function fetchPostsForUser(user) {
  await ensureSocialPostsTables();
  const admin = isPortalAdminUser(user);
  const result = admin
    ? await pool.query(
        `
          SELECT *
          FROM social_posts
          ORDER BY created_at DESC
        `
      )
    : await pool.query(
        `
          SELECT *
          FROM social_posts
          WHERE status = 'approved' OR author_id = $1
          ORDER BY created_at DESC
        `,
        [user.id]
      );

  const postIds = result.rows.map((r) => r.id);
  const reactionMap = await loadUserReactionsForPosts(postIds, user.id);
  return result.rows.map((row) => mapPostRow(row, reactionMap[String(row.id)] || {}));
}

async function fetchPostById(id) {
  await ensureSocialPostsTables();
  const result = await pool.query('SELECT * FROM social_posts WHERE id = $1 LIMIT 1', [id]);
  return result.rows[0] || null;
}

module.exports = {
  ensureSocialPostsTables,
  isPortalAdminUser,
  mapPostRow,
  loadUserReactionsForPosts,
  fetchPostsForUser,
  fetchPostById,
};
