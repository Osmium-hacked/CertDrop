import jsQR from 'jsqr';
import type { PDFPage } from 'pdf-lib';
import QRCode from 'qrcode';
import { describe, expect, it } from 'vitest';
import { drawQrCode } from '../../src/pdf/qr';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
  color: { red: number };
}

/**
 * Records the rectangles drawQrCode emits and paints them into an RGBA bitmap, flipping PDF's
 * bottom-up y axis the way a viewer would. If the code decodes from that bitmap, a phone camera
 * can read the printed certificate too, so this catches flipped rows or mirrored columns.
 */
function rasterize(text: string, sizePt: number, pxPerPt: number): { data: Uint8ClampedArray; side: number } {
  const rects: Rect[] = [];
  const page = { drawRectangle: (r: Rect) => rects.push(r) } as unknown as PDFPage;
  const originX = 30;
  const originY = 50;
  drawQrCode(page, text, originX, originY, sizePt);

  const side = Math.round(sizePt * pxPerPt);
  const data = new Uint8ClampedArray(side * side * 4).fill(255);
  for (const r of rects) {
    const shade = Math.round(r.color.red * 255);
    const x0 = Math.round((r.x - originX) * pxPerPt);
    const x1 = Math.round((r.x - originX + r.width) * pxPerPt);
    const y0 = Math.round((originY + sizePt - (r.y + r.height)) * pxPerPt); // flip: PDF y goes up
    const y1 = Math.round((originY + sizePt - r.y) * pxPerPt);
    for (let y = Math.max(0, y0); y < Math.min(side, y1); y++) {
      for (let x = Math.max(0, x0); x < Math.min(side, x1); x++) {
        const i = (y * side + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = shade;
      }
    }
  }
  return { data, side };
}

describe('drawQrCode', () => {
  it.each([
    'http://localhost:5173/verify/CD-sPUNEGmVcj',
    'https://certdrop.example.org/verify/CD-7kQm2xPd9T',
  ])('draws a QR code that decodes back to %s', (url) => {
    const { data, side } = rasterize(url, 90, 4);
    expect(jsQR(data, side, side)?.data).toBe(url);
  });

  it('merges dark modules into runs instead of one rectangle per module', () => {
    const url = 'https://certdrop.example.org/verify/CD-7kQm2xPd9T';
    const rects: unknown[] = [];
    const page = { drawRectangle: (r: unknown) => rects.push(r) } as unknown as PDFPage;
    drawQrCode(page, url, 0, 0, 90);

    const { modules } = QRCode.create(url, { errorCorrectionLevel: 'M' });
    const dark = modules.data.reduce((sum, bit) => sum + bit, 0);
    // One background rectangle plus the runs: well under one rectangle per dark module.
    expect(rects.length - 1).toBeLessThan(dark * 0.75);
  });
});
