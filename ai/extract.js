// Spec 12 — extract plain text from a source file. Dispatches on extension:
// PDFs via pdf-parse (existing text layer only — scanned/image PDFs yield little
// or no text, OCR out of scope), .txt/.md read as-is. No DB, no network.
const fs = require('fs');
const path = require('path');

const extractText = async (filePath) => {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.pdf') {
    const pdf = require('pdf-parse'); // required lazily so non-PDF paths don't load it
    const data = await pdf(fs.readFileSync(filePath));
    return data.text;
  }

  if (ext === '.txt' || ext === '.md') {
    return fs.readFileSync(filePath, 'utf8');
  }

  throw new Error(`Unsupported file type "${ext || '(none)'}": use .pdf, .txt, or .md`);
};

module.exports = { extractText };
