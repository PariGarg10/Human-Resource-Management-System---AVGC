const fs = require('fs');

async function extractPdfText(filePath) {
  const { PDFParse } = require('pdf-parse');
  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result?.text || '';
  } finally {
    await parser.destroy();
  }
}

async function extractTextFromFile(filePath, originalName) {
  const ext = String(originalName || filePath)
    .split('.')
    .pop()
    .toLowerCase();

  if (ext === 'txt') {
    return fs.readFileSync(filePath, 'utf8');
  }

  if (ext === 'pdf') {
    return extractPdfText(filePath);
  }

  if (ext === 'docx') {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value || '';
  }

  throw new Error('Unsupported file type. Use .pdf, .txt, or .docx');
}

module.exports = { extractTextFromFile };
