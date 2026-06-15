const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool } = require('../db');
const { authMiddleware, enforceForcePasswordChange, requirePortalAdmin } = require('../middleware/auth');
const { getUploadsRoot } = require('../utils/storagePaths');
const { extractTextFromFile } = require('../utils/policyTextExtract');
const { PLATFORM_GUIDE } = require('../utils/platformGuide');

const router = express.Router();
router.use(authMiddleware);
router.use(enforceForcePasswordChange);

const uploadDir = getUploadsRoot('policy-chat');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const safe = String(file.originalname || 'document').replace(/[^\w.\-]+/g, '_');
      cb(null, `${Date.now()}-${safe}`);
    },
  }),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (['.pdf', '.txt', '.docx'].includes(ext)) return cb(null, true);
    return cb(new Error('Only PDF, TXT, and DOCX files are allowed'));
  },
});

const SYSTEM_PROMPT = `You are Maya, a warm and friendly HR assistant at AVGC Studios. You help employees with company policies AND with using the AVGC HRMS portal.

How to respond:
- Treat every message as real conversation: greetings, thanks, worries, casual statements, and full questions all deserve a natural reply.
- Empathize briefly when someone sounds stressed or unsure, then guide them helpfully.
- For policy topics (leave, attendance, WFH, conduct, benefits, holidays), answer using ONLY the policy documents in the context block when available.
- For portal / platform questions (where to click, how to apply leave, find payslips, complete onboarding, use performance reviews), use the AVGC portal guide in the context block. Give step-by-step directions referencing sidebar menu names.
- If something is not covered, say so kindly and suggest HR or their manager.
- Keep replies concise (usually 2–4 short paragraphs). Plain language, occasional warmth.
- Do not mention being an AI unless asked. You work with the AVGC HR team.`;

function firstNameFromUser(user) {
  const raw = String(user?.name || '').trim();
  if (!raw) return '';
  return raw.split(/\s+/)[0] || '';
}

function tryLocalReply(message, firstName) {
  const m = String(message || '').toLowerCase().trim();
  const hi = firstName ? ` ${firstName}` : '';
  if (/^(hi|hello|hey|hiya|good morning|good afternoon|good evening|namaste|yo)\b/.test(m)) {
    return `Hey${hi}! I'm Maya from AVGC HR — happy to chat. Ask me anything about leave, attendance, or company policies, or just tell me what's on your mind and I'll point you in the right direction.`;
  }
  if (/^(thanks|thank you|thx|ty|appreciate)/.test(m)) {
    return `You're welcome${hi}! If anything else comes up about policies or HR stuff, I'm right here.`;
  }
  if (/^(bye|goodbye|see you|gtg)/.test(m)) {
    return `Take care${hi}! Drop by anytime you need help with AVGC policies.`;
  }
  if (/(just joined|new here|new employee|first day|onboarding)/.test(m)) {
    return `Welcome aboard${hi}! Start with **Onboarding** in the sidebar — that unlocks the rest of the portal. I can walk you through leave, attendance, profile setup, or any policy. What would you like to tackle first?`;
  }
  if (/(how do i|where (is|do|can)|how to|navigate|portal|dashboard|apply leave|payslip|attendance|profile|onboarding|performance|self.?assessment)/.test(m)) {
    return `Happy to guide you${hi}! Open the matching item in the left sidebar — e.g. **Leave Management** to apply leave, **Attendance** for your log, **Payroll & payslips** for salary info, **Performance** during review cycles. Tell me what you're trying to do and I'll give you the exact steps.`;
  }
  if (/(confused|don't understand|not sure|help me|what should i)/.test(m)) {
    return `No worries${hi} — happy to help. Tell me a bit more about what you're trying to figure out (leave, attendance, holidays, etc.) and I'll walk you through what our policies say.`;
  }
  return null;
}

async function loadPolicyContext() {
  const { rows } = await pool.query(
    `SELECT filename, content FROM policy_chat_documents ORDER BY uploaded_at DESC`
  );
  const combined = rows.map((r) => `--- ${r.filename} ---\n${r.content || ''}`).join('\n\n');
  if (!combined.trim()) return '';
  const max = 6000;
  return combined.length > max ? combined.slice(0, max) : combined;
}

function normalizeHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(-12)
    .map((item) => {
      const role = item?.role === 'assistant' || item?.role === 'bot' ? 'assistant' : 'user';
      const content = String(item?.content || item?.text || '').trim();
      if (!content) return null;
      return { role, content };
    })
    .filter(Boolean);
}

async function askClaude(userMessage, policyContext, history, firstName) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });

  const contextBlock = policyContext.trim()
    ? `\n\n--- AVGC policy documents (use only this for policy facts) ---\n${policyContext}`
    : '\n\n(No policy documents uploaded yet — for policy facts, be honest about that and point to HR.)';

  const platformBlock = `\n\n--- AVGC portal guide (use for navigation & how-to questions) ---\n${PLATFORM_GUIDE}`;

  const system = `${SYSTEM_PROMPT}${platformBlock}${contextBlock}${
    firstName ? `\nThe employee's first name is ${firstName}. Use it naturally when appropriate.` : ''
  }`;

  const messages = [...history];
  messages.push({ role: 'user', content: userMessage });

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 900,
    system,
    messages,
  });

  const block = message.content?.find((b) => b.type === 'text');
  return block?.text?.trim() || null;
}

async function buildReply(userMessage, policyContext, history, firstName) {
  const local = tryLocalReply(userMessage, firstName);
  if (local && history.length === 0) return local;

  const fromClaude = await askClaude(userMessage, policyContext, history, firstName);
  if (fromClaude) return fromClaude;

  if (local) return local;

  if (!process.env.ANTHROPIC_API_KEY) {
    return policyContext.trim()
      ? `Hi${firstName ? ` ${firstName}` : ''}! I'm Maya. The policy assistant isn't fully connected yet — please contact HR for detailed answers. You can still ask me simple things and I'll do my best!`
      : 'No policy documents have been uploaded yet. Please contact HR — they can help with any policy questions.';
  }

  return 'I had trouble putting that into words — could you try rephrasing? For anything urgent, HR is always happy to help.';
}

/** POST /api/policies/chat */
router.post('/chat', async (req, res) => {
  try {
    const userMessage = String(req.body?.message || req.body?.question || '').trim();
    const sessionId = String(req.body?.sessionId || '').trim();
    const history = normalizeHistory(req.body?.history);
    if (!userMessage) return res.status(400).json({ message: 'message is required' });
    if (!sessionId) return res.status(400).json({ message: 'sessionId is required' });

    const policyContext = await loadPolicyContext();
    const firstName = firstNameFromUser(req.user);
    const answer = await buildReply(userMessage, policyContext, history, firstName);
    return res.json({ answer, sessionId });
  } catch (err) {
    console.error('POST /policies/chat:', err.message);
    return res.status(500).json({ message: 'Could not process your message' });
  }
});

/** GET knowledge base list — admin */
router.get('/knowledge', requirePortalAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, filename, uploaded_at FROM policy_chat_documents ORDER BY uploaded_at DESC`
    );
    return res.json({ documents: rows });
  } catch (err) {
    console.error('GET /policies/knowledge:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** POST upload knowledge document — admin */
router.post('/knowledge/upload', requirePortalAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'file is required' });
    const content = await extractTextFromFile(req.file.path, req.file.originalname);
    const trimmed = String(content || '').trim();
    if (!trimmed) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: 'Could not extract text from this file' });
    }
    const inserted = await pool.query(
      `
        INSERT INTO policy_chat_documents (filename, content, uploaded_by)
        VALUES ($1, $2, $3)
        RETURNING id, filename, uploaded_at
      `,
      [req.file.originalname, trimmed.slice(0, 500000), req.user.id]
    );
    return res.status(201).json({ document: inserted.rows[0], message: 'Document uploaded' });
  } catch (err) {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error('POST /policies/knowledge/upload:', err.message);
    return res.status(500).json({ message: err.message || 'Upload failed' });
  }
});

/** DELETE knowledge document — admin */
router.delete('/knowledge/:id', requirePortalAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id' });
    const del = await pool.query('DELETE FROM policy_chat_documents WHERE id = $1 RETURNING id', [id]);
    if (!del.rows[0]) return res.status(404).json({ message: 'Document not found' });
    return res.json({ message: 'Document deleted' });
  } catch (err) {
    console.error('DELETE /policies/knowledge/:id:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
