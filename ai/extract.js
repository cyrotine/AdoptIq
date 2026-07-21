// Spec 12 — extract plain text from a source file. Dispatches on extension:
// PDFs via pdf-parse (existing text layer only — scanned/image PDFs yield little
// or no text, OCR out of scope), .txt/.md read as-is. No DB, no network.
const fs = require('fs');
const path = require('path');

const extractText = async (filePath) => {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.pdf') {
    // pdf-parse v2 is class-based (v1's callable default is gone). Lazily required
    // so non-PDF paths don't load it.
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: fs.readFileSync(filePath) });
    try {
      const { text } = await parser.getText();
      return text;
    } finally {
      await parser.destroy(); // release the worker
    }
  }

  if (ext === '.txt' || ext === '.md') {
    return fs.readFileSync(filePath, 'utf8');
  }

  throw new Error(`Unsupported file type "${ext || '(none)'}": use .pdf, .txt, or .md`);
};

module.exports = { extractText };
