const fs = require('fs');

async function extractPdfText(buffer) {
  const { PDFParse } = require('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result?.text || '';
  } finally {
    await parser.destroy();
  }
}

async function extractTextFromBuffer(buffer, originalName) {
  const ext = String(originalName || '')
    .split('.')
    .pop()
    .toLowerCase();

  if (ext === 'txt') {
    return buffer.toString('utf8');
  }

  if (ext === 'pdf') {
    return extractPdfText(buffer);
  }

  if (ext === 'docx') {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
  }

  throw new Error('Unsupported file type. Use .pdf, .txt, or .docx');
}

async function extractTextFromFile(filePath, originalName) {
  return extractTextFromBuffer(fs.readFileSync(filePath), originalName);
}

module.exports = { extractTextFromFile, extractTextFromBuffer };
