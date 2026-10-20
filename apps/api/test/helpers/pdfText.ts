import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

/**
 * Extracts the text of page 1 the way a PDF viewer would read it. If glyphs were embedded or
 * mapped wrongly (e.g. broken font subsetting), the extracted text comes out garbled and the
 * renderer tests fail.
 */
export async function extractText(pdf: Uint8Array): Promise<string> {
  const task = getDocument({ data: pdf.slice(), useSystemFonts: false, verbosity: 0 });
  try {
    const page = await (await task.promise).getPage(1);
    const content = await page.getTextContent();
    // Font runs within a line are separate items, so join them directly; pdf.js marks line ends.
    return content.items
      .map((item) => ('str' in item ? item.str + (item.hasEOL ? ' ' : '') : ''))
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
  } finally {
    await task.destroy();
  }
}
