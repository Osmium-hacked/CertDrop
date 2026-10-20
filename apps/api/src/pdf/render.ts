import {
  CERT_FONT_META,
  fitName,
  positionLines,
  splitFontRuns,
  type FitResult,
  type Layout,
  type MeasureText,
  type TemplateMimeType,
} from '@certdrop/shared';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont } from 'pdf-lib';
import type { FontLibrary } from './fonts';
import { drawQrCode } from './qr';

/**
 * Turns an uploaded template into a one-page PDF to draw on. Done once per batch and cached by
 * the worker: for image templates the image is decoded and compressed once, not once per
 * certificate.
 */
export async function prepareBasePdf(
  template: Uint8Array,
  mimeType: TemplateMimeType,
  page: { widthPt: number; heightPt: number },
): Promise<Uint8Array> {
  if (mimeType === 'application/pdf') {
    // Copy just the first page into a fresh document, dropping anything else the file carries.
    const source = await PDFDocument.load(template, { updateMetadata: false });
    const doc = await PDFDocument.create();
    const [copied] = await doc.copyPages(source, [0]);
    doc.addPage(copied);
    return doc.save();
  }
  const doc = await PDFDocument.create();
  const pdfPage = doc.addPage([page.widthPt, page.heightPt]);
  const image = mimeType === 'image/png' ? await doc.embedPng(template) : await doc.embedJpg(template);
  pdfPage.drawImage(image, { x: 0, y: 0, width: page.widthPt, height: page.heightPt });
  return doc.save();
}

export interface CertificateInput {
  basePdf: Uint8Array;
  layout: Layout;
  recipientName: string;
  certId: string;
  verifyUrl: string;
  eventName: string;
  issuerName: string;
}

export interface RenderedCertificate {
  pdf: Uint8Array;
  fit: FitResult;
}

function hexToRgb(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export async function renderCertificate(
  input: CertificateInput,
  fonts: FontLibrary,
): Promise<RenderedCertificate> {
  const { layout } = input;
  const doc = await PDFDocument.load(input.basePdf);
  doc.registerFontkit(fontkit);
  const page = doc.getPage(0);
  const crop = page.getCropBox();

  // Fonts are embedded whole: pdf-lib's subsetting corrupts glyphs in some of these fonts
  // (seen with Inter). The fallback font is only embedded when the name actually needs it.
  const needsFallback = splitFontRuns(input.recipientName, layout.font).some((r) => r.fallback);
  const primaryPdfFont = await doc.embedFont(await fonts.primary(layout.font), { subset: false });
  const fallbackPdfFont: PDFFont | null = needsFallback
    ? await doc.embedFont(await fonts.fallback(), { subset: false })
    : null;

  // Word-level font runs, decided by the shared coverage table exactly as the preview decides.
  const runsOf = (text: string) =>
    splitFontRuns(text, layout.font).map((run) => ({
      ...run,
      pdfFont: run.fallback && fallbackPdfFont ? fallbackPdfFont : primaryPdfFont,
    }));
  const measure: MeasureText = (text) =>
    runsOf(text).reduce((width, run) => width + run.pdfFont.widthOfTextAtSize(run.text, 1), 0);

  // Same fit and placement code the browser preview runs, with this side's measurements.
  const box = {
    x: crop.x + layout.nameBox.x * crop.width,
    top: crop.y + crop.height - layout.nameBox.y * crop.height,
    width: layout.nameBox.width * crop.width,
    height: layout.nameBox.height * crop.height,
  };
  const fit = fitName(input.recipientName, box, layout.fontSize, measure);
  const lines = positionLines(fit, box, layout.align, measure, CERT_FONT_META[layout.font].metrics);
  const color = hexToRgb(layout.color);

  for (const line of lines) {
    let x = box.x + line.x;
    const y = box.top - line.baseline; // positionLines measures down from the top; PDF y goes up
    for (const run of runsOf(line.text)) {
      page.drawText(run.text, { x, y, size: fit.fontSize, font: run.pdfFont, color });
      x += run.pdfFont.widthOfTextAtSize(run.text, fit.fontSize);
    }
  }

  if (layout.qrBox) {
    const qrWidth = layout.qrBox.width * crop.width;
    const qrHeight = layout.qrBox.height * crop.height;
    const size = Math.min(qrWidth, qrHeight);
    const left = crop.x + layout.qrBox.x * crop.width;
    const top = crop.y + crop.height - layout.qrBox.y * crop.height;
    drawQrCode(page, input.verifyUrl, left, top - size, size);
  }

  // Document metadata makes the file self-describing in any PDF viewer.
  doc.setTitle(`Certificate: ${input.recipientName}`);
  doc.setSubject(input.eventName);
  doc.setAuthor(input.issuerName);
  doc.setKeywords([input.certId, input.verifyUrl]);
  doc.setProducer('CertDrop');
  doc.setCreator('CertDrop');

  return { pdf: await doc.save(), fit };
}
