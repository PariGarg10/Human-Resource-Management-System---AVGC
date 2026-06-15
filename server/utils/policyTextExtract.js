const fs = require('fs');

async function extractTextFromFile(filePath, originalName) {
  const ext = String(originalName || filePath)
    .split('.')
    .pop()
    .toLowerCase();

  if (ext === 'txt') {
    return fs.readFileSync(filePath, 'utf8');
  }

  if (ext === 'pdf') {
    const pdfParse = require('pdf-parse');
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return data.text || '';
  }

  if (ext === 'docx') {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value || '';
  }

  throw new Error('Unsupported file type. Use .pdf, .txt, or .docx');
}

module.exports = { extractTextFromFile };
