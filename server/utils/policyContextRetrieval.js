function tokenize(text) {
  return [...new Set(String(text || '').toLowerCase().match(/\b[a-z0-9]{3,}\b/g) || [])];
}

function splitIntoChunks(text, chunkSize = 2200, overlap = 250) {
  const source = String(text || '');
  if (!source.trim()) return [];
  const chunks = [];
  let index = 0;
  while (index < source.length) {
    chunks.push(source.slice(index, index + chunkSize));
    index += chunkSize - overlap;
  }
  return chunks;
}

function isBroadQuery(message) {
  const m = String(message || '').toLowerCase();
  return /(all policies|everything|overview|summarize|summary|list all|what (are|is) (the )?(policies|rules|benefits)|tell me about|explain (the )?policy|company policy|hr policy)/.test(
    m
  );
}

function scoreChunk(chunk, queryTokens) {
  const lower = chunk.toLowerCase();
  let score = 0;
  for (const token of queryTokens) {
    if (lower.includes(token)) score += 1;
  }
  return score;
}

function retrieveRelevantPolicyContext(documents, userMessage, maxChars = 32000) {
  const rows = Array.isArray(documents) ? documents : [];
  if (!rows.length) return '';

  const queryTokens = tokenize(userMessage);
  const broad = isBroadQuery(userMessage) || queryTokens.length <= 2;

  const allChunks = [];
  for (const doc of rows) {
    const filename = doc.filename || 'document';
    const content = String(doc.content || '');
    const chunks = splitIntoChunks(content);
    const perDocLimit = broad ? Math.max(3, Math.ceil(chunks.length * 0.6)) : chunks.length;

    chunks.slice(0, perDocLimit).forEach((chunk, idx) => {
      allChunks.push({
        filename,
        text: `--- ${filename} ---\n${chunk}`,
        score: scoreChunk(chunk, queryTokens) + (idx === 0 ? 3 : 0),
      });
    });
  }

  if (!queryTokens.length || broad) {
    return allChunks
      .map((chunk) => chunk.text)
      .join('\n\n')
      .slice(0, maxChars);
  }

  allChunks.sort((a, b) => b.score - a.score);

  const selected = [];
  const seenFiles = new Set();
  let used = 0;

  const tryAdd = (chunk) => {
    if (used + chunk.text.length > maxChars) return false;
    selected.push(chunk);
    seenFiles.add(chunk.filename);
    used += chunk.text.length;
    return true;
  };

  for (const chunk of allChunks) {
    if (chunk.score > 0) tryAdd(chunk);
  }
  for (const chunk of allChunks) {
    if (!seenFiles.has(chunk.filename)) tryAdd(chunk);
  }
  for (const chunk of allChunks) {
    if (selected.includes(chunk)) continue;
    tryAdd(chunk);
  }

  if (!selected.length) {
    return allChunks
      .slice(0, 8)
      .map((chunk) => chunk.text)
      .join('\n\n')
      .slice(0, maxChars);
  }

  return selected.map((chunk) => chunk.text).join('\n\n').slice(0, maxChars);
}

module.exports = { retrieveRelevantPolicyContext, tokenize };
