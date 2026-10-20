import type { PDFPage } from 'pdf-lib';
import { rgb } from 'pdf-lib';
import QRCode from 'qrcode';

/** QR spec: a 4-module blank border so scanners can find the code against a busy background. */
const QUIET_ZONE = 4;

/**
 * Draws a QR code as vector rectangles: sharp at any print size, and no image encoding step.
 * Adjacent dark modules in a row are merged into one rectangle to keep the PDF small.
 * (x, y) is the bottom-left corner in PDF coordinates.
 */
export function drawQrCode(page: PDFPage, text: string, x: number, y: number, size: number): void {
  // Level M survives ~15% damage (a fold, a scuff, a pen mark) without making the code too dense.
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const count = modules.size + QUIET_ZONE * 2;
  const cell = size / count;

  page.drawRectangle({ x, y, width: size, height: size, color: rgb(1, 1, 1) });

  const dark = rgb(0, 0, 0);
  for (let row = 0; row < modules.size; row++) {
    let runStart = -1;
    for (let col = 0; col <= modules.size; col++) {
      const on = col < modules.size && modules.get(row, col) === 1;
      if (on && runStart === -1) runStart = col;
      if (!on && runStart !== -1) {
        page.drawRectangle({
          x: x + (runStart + QUIET_ZONE) * cell,
          // QR rows run top-down; PDF y runs bottom-up.
          y: y + size - (row + QUIET_ZONE + 1) * cell,
          width: (col - runStart) * cell,
          height: cell,
          color: dark,
        });
        runStart = -1;
      }
    }
  }
}
