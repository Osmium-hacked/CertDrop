import { CERT_FONTS, type Layout } from '@certdrop/shared';
import { PDFDocument } from 'pdf-lib';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { FontLibrary } from '../../src/pdf/fonts';
import { prepareBasePdf, renderCertificate } from '../../src/pdf/render';
import { makePdf, makePng } from '../helpers/files';
import { extractText } from '../helpers/pdfText';

const fonts = new FontLibrary(path.resolve(import.meta.dirname, '../../../../packages/shared/fonts'));

const layout: Layout = {
  nameBox: { x: 0.15, y: 0.42, width: 0.7, height: 0.13 },
  font: 'playfair-display',
  fontSize: 44,
  color: '#1f2433',
  align: 'center',
  qrBox: null,
};

let basePdf: Uint8Array;
beforeAll(async () => {
  basePdf = await prepareBasePdf(await makePdf([[842, 595]]), 'application/pdf', {
    widthPt: 842,
    heightPt: 595,
  });
});

const render = (recipientName: string, overrides: Partial<Layout> = {}, base = basePdf) =>
  renderCertificate(
    {
      basePdf: base,
      layout: { ...layout, ...overrides },
      recipientName,
      certId: 'CD-7kQm2xPd9T',
      verifyUrl: 'http://localhost:5173/verify/CD-7kQm2xPd9T',
      eventName: 'Spring Hackathon 2026',
      issuerName: 'Robotics Club',
    },
    fonts,
  );

describe('renderCertificate', () => {
  it.each(CERT_FONTS)('draws a readable name in %s', async (font) => {
    const { pdf } = await render('Łukasz Żółć-Müller', { font });
    expect(await extractText(pdf)).toBe('Łukasz Żółć-Müller');
  });

  it('falls back to Noto Sans for characters the chosen font lacks', async () => {
    // Playfair Display has no Greek glyphs.
    const { pdf } = await render('Αλέξης Παπαδόπουλος', { font: 'playfair-display' });
    expect(await extractText(pdf)).toBe('Αλέξης Παπαδόπουλος');
  });

  it('mixes fonts within one name when needed', async () => {
    const { pdf } = await render('Ana Ωμέγα', { font: 'montserrat' });
    expect(await extractText(pdf)).toBe('Ana Ωμέγα');
  });

  it('wraps long names onto two lines inside the box', async () => {
    // A box tall enough for two lines at the minimum size (43pt × 1.2 × 2 ≈ 104pt of 595pt).
    const { pdf, fit } = await render('Maria Fernanda Rodrigues da Silva Santos Oliveira', {
      fontSize: 72,
      nameBox: { x: 0.1, y: 0.35, width: 0.8, height: 0.25 },
    });
    expect(fit.lines).toHaveLength(2);
    expect(fit.belowMinimum).toBe(false);
    expect(await extractText(pdf)).toBe(fit.lines.join(' '));
  });

  it('renders on image templates', async () => {
    const base = await prepareBasePdf(makePng(1200, 848), 'image/png', { widthPt: 842, heightPt: 595.03 });
    const { pdf } = await render('Ana Lima', {}, base);
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPage(0).getSize()).toEqual({ width: 842, height: 595.03 });
    expect(await extractText(pdf)).toBe('Ana Lima');
  });

  it('adds the QR code and self-describing metadata', async () => {
    const withQr = await render('Ana Lima', { qrBox: { x: 0.8, y: 0.7, width: 0.12, height: 0.17 } });
    const without = await render('Ana Lima');
    // The vector QR code adds drawing operations to the page.
    expect(withQr.pdf.length).toBeGreaterThan(without.pdf.length);

    const doc = await PDFDocument.load(withQr.pdf);
    expect(doc.getTitle()).toBe('Certificate: Ana Lima');
    expect(doc.getAuthor()).toBe('Robotics Club');
    expect(doc.getKeywords()).toContain('CD-7kQm2xPd9T');
  });

  it('only embeds the fallback font when a name needs it', async () => {
    const latin = await render('Ana Lima', { font: 'playfair-display' });
    const greek = await render('Αλέξης', { font: 'playfair-display' });
    expect(greek.pdf.length - latin.pdf.length).toBeGreaterThan(200_000); // Noto Sans is ~545 KB
    expect(latin.pdf.length).toBeLessThan(400_000);
  });
});
