const express = require('express');
const path = require('path');
const multer = require('multer');
const { pool } = require('../db');
const { authMiddleware, enforceForcePasswordChange, requirePortalAdmin } = require('../middleware/auth');
const { getUploadsRoot } = require('../utils/storagePaths');
const {
  ensureSocialPostsTables,
  isPortalAdminUser,
  mapPostRow,
  loadUserReactionsForPosts,
  fetchPostById,
  fetchPostsForUser,
} = require('../utils/socialPosts');

const router = express.Router();
const uploadDir = getUploadsRoot('social-posts');

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').slice(0, 12).toLowerCase();
      const safe = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
      cb(null, safe);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const mime = String(file.mimetype || '').toLowerCase();
    const imageOk = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) || mime.startsWith('image/');
    const videoOk = ['.mp4', '.webm', '.mov'].includes(ext) || mime.startsWith('video/');
    if (imageOk || videoOk) return cb(null, true);
    return cb(new Error('Only image and video files are allowed'));
  },
});

function uploadSingle(fieldName) {
  return (req, res, next) => {
    upload.single(fieldName)(req, res, (err) => {
      if (err) return res.status(400).json({ message: err.message || 'File upload failed' });
      return next();
    });
  };
}

function parseChannel(value) {
  const channel = String(value || '').trim().toLowerCase();
  return channel === 'artwork' || channel === 'board' || channel === 'gaming' ? channel : null;
}

function commentId() {
  return `c_${Math.random().toString(36).slice(2, 10)}`;
}

async function mapPostForUser(row, userId) {
  const reactions = await loadUserReactionsForPosts([row.id], userId);
  return mapPostRow(row, reactions[String(row.id)] || {});
}

router.use(authMiddleware);
router.use(enforceForcePasswordChange);

router.get('/', async (req, res) => {
  try {
    const posts = await fetchPostsForUser(req.user);
    return res.json({ posts, isAdmin: isPortalAdminUser(req.user) });
  } catch (err) {
    console.error('GET /social-posts:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/', uploadSingle('media'), async (req, res) => {
  try {
    await ensureSocialPostsTables();
    const channel = parseChannel(req.body?.channel);
    if (!channel) return res.status(400).json({ message: 'Channel must be artwork, board, or gaming' });

    const title = String(req.body?.title || '').trim();
    const caption = String(req.body?.caption || '').trim();
    const category = String(req.body?.category || '').trim();

    if (channel === 'artwork' && !req.file) {
      return res.status(400).json({ message: 'Artwork file is required' });
    }
    if (channel === 'artwork' && !title) {
      return res.status(400).json({ message: 'Title is required for artwork posts' });
    }

    let mediaUrl = '';
    let mediaType = 'text';
    if (req.file) {
      mediaUrl = `/uploads/social-posts/${req.file.filename}`;
      mediaType = String(req.file.mimetype || '').startsWith('video/') ? 'video' : 'image';
    }

    const authorName = String(req.user.name || 'Employee').trim() || 'Employee';

    const ins = await pool.query(
      `
        INSERT INTO social_posts
          (channel, status, author_id, author_name, title, caption, category, media_url, media_type)
        VALUES ($1, 'pending', $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `,
      [channel, req.user.id, authorName, title, caption, category, mediaUrl, mediaType]
    );

    const post = await mapPostForUser(ins.rows[0], req.user.id);
    return res.status(201).json({ post, message: 'Submitted for approval' });
  } catch (err) {
    console.error('POST /social-posts:', err.message);
    return res.status(400).json({ message: err.message || 'Could not create post' });
  }
});

router.patch('/:id', requirePortalAdmin, async (req, res) => {
  try {
    await ensureSocialPostsTables();
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id' });

    const action = String(req.body?.action || '').trim().toLowerCase();
    if (action !== 'approve' && action !== 'reject') {
      return res.status(400).json({ message: 'Action must be approve or reject' });
    }

    const existing = await fetchPostById(id);
    if (!existing) return res.status(404).json({ message: 'Post not found' });

    if (action === 'approve') {
      const upd = await pool.query(
        `
          UPDATE social_posts
          SET status = 'approved', reject_reason = NULL, updated_at = NOW()
          WHERE id = $1
          RETURNING *
        `,
        [id]
      );
      const post = await mapPostForUser(upd.rows[0], req.user.id);
      return res.json({ post, message: 'Post approved' });
    }

    const reason = String(req.body?.reason || '').trim();
    const upd = await pool.query(
      `
        UPDATE social_posts
        SET status = 'rejected', reject_reason = $2, updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [id, reason || null]
    );
    const post = await mapPostForUser(upd.rows[0], req.user.id);
    return res.json({ post, message: 'Post rejected' });
  } catch (err) {
    console.error('PATCH /social-posts/:id:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/:id/reactions', async (req, res) => {
  try {
    await ensureSocialPostsTables();
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id' });

    const emoji = String(req.body?.emoji || '').trim();
    if (!emoji) return res.status(400).json({ message: 'Emoji is required' });

    const existing = await fetchPostById(id);
    if (!existing) return res.status(404).json({ message: 'Post not found' });
    if (existing.status !== 'approved') {
      return res.status(400).json({ message: 'Reactions are only allowed on approved posts' });
    }

    const had = await pool.query(
      `
        SELECT 1 FROM social_post_user_reactions
        WHERE post_id = $1 AND employee_id = $2 AND emoji = $3
        LIMIT 1
      `,
      [id, req.user.id, emoji]
    );

    const reactions = { ...(existing.reactions || {}) };

    if (had.rows.length) {
      await pool.query(
        `DELETE FROM social_post_user_reactions WHERE post_id = $1 AND employee_id = $2 AND emoji = $3`,
        [id, req.user.id, emoji]
      );
      reactions[emoji] = Math.max(0, (reactions[emoji] || 0) - 1);
      if (reactions[emoji] === 0) delete reactions[emoji];
    } else {
      await pool.query(
        `INSERT INTO social_post_user_reactions (post_id, employee_id, emoji) VALUES ($1, $2, $3)`,
        [id, req.user.id, emoji]
      );
      reactions[emoji] = (reactions[emoji] || 0) + 1;
    }

    const upd = await pool.query(
      `
        UPDATE social_posts
        SET reactions = $2::jsonb, updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [id, JSON.stringify(reactions)]
    );

    const post = await mapPostForUser(upd.rows[0], req.user.id);
    return res.json({ post });
  } catch (err) {
    console.error('POST /social-posts/:id/reactions:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/:id/comments', async (req, res) => {
  try {
    await ensureSocialPostsTables();
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id' });

    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ message: 'Comment text is required' });

    const existing = await fetchPostById(id);
    if (!existing) return res.status(404).json({ message: 'Post not found' });
    if (existing.status !== 'approved') {
      return res.status(400).json({ message: 'Comments are only allowed on approved posts' });
    }

    const comments = Array.isArray(existing.comments) ? [...existing.comments] : [];
    const authorName = String(req.user.name || 'Employee').trim() || 'Employee';
    comments.push({
      id: commentId(),
      author: authorName,
      text,
      at: Date.now(),
    });

    const upd = await pool.query(
      `
        UPDATE social_posts
        SET comments = $2::jsonb, updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [id, JSON.stringify(comments)]
    );

    const post = await mapPostForUser(upd.rows[0], req.user.id);
    return res.json({ post });
  } catch (err) {
    console.error('POST /social-posts/:id/comments:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
