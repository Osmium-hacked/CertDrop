// Generates seed/sample-template.pdf: a generic certificate design for demos and local testing,
// with an empty band where the recipient's name goes.
// Usage: pnpm --filter @certdrop/api seed:template
import fontkit from '@pdf-lib/fontkit';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const FONTS = path.join(ROOT, 'packages/shared/fonts');
const OUT = path.join(ROOT, 'seed/sample-template.pdf');

const ink = rgb(0.14, 0.15, 0.2);
const muted = rgb(0.42, 0.43, 0.48);
const gold = rgb(0.7, 0.56, 0.3);

function centred(page: PDFPage, text: string, y: number, font: PDFFont, size: number, color = ink) {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: (page.getWidth() - width) / 2, y, size, font, color });
}

const doc = await PDFDocument.create();
doc.registerFontkit(fontkit);
doc.setTitle('CertDrop sample certificate template');
const serif = await doc.embedFont(await readFile(path.join(FONTS, 'PlayfairDisplay-SemiBold.ttf')), {
  subset: false,
});
const sans = await doc.embedFont(await readFile(path.join(FONTS, 'Inter-SemiBold.ttf')), { subset: false });

const page = doc.addPage([842, 595]); // A4 landscape
const { width, height } = page.getSize();

page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(0.985, 0.976, 0.955) });
page.drawRectangle({
  x: 22,
  y: 22,
  width: width - 44,
  height: height - 44,
  borderColor: gold,
  borderWidth: 2.5,
});
page.drawRectangle({
  x: 32,
  y: 32,
  width: width - 64,
  height: height - 64,
  borderColor: gold,
  borderWidth: 0.75,
});

centred(page, 'CERTIFICATE OF COMPLETION', 452, sans, 13, gold);
centred(page, 'Certificate of Completion', 400, serif, 38);
centred(page, 'This certificate is proudly presented to', 352, sans, 11, muted);

// Name band: deliberately empty. A hairline underneath marks where names sit.
page.drawLine({ start: { x: 221, y: 250 }, end: { x: 621, y: 250 }, thickness: 0.75, color: gold });

centred(page, 'for successfully completing the Sample Workshop 2026', 214, sans, 11, muted);

for (const [x, label] of [
  [150, 'Programme Director'],
  [512, 'Date'],
] as const) {
  page.drawLine({ start: { x, y: 120 }, end: { x: x + 180, y: 120 }, thickness: 0.75, color: muted });
  const w = sans.widthOfTextAtSize(label, 9);
  page.drawText(label, { x: x + (180 - w) / 2, y: 104, size: 9, font: sans, color: muted });
}

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, await doc.save());
console.log(`Wrote ${path.relative(ROOT, OUT)}`);
