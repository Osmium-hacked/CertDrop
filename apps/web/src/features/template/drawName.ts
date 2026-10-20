import { splitFontRuns, type Layout } from '@certdrop/shared';
import { runFont } from '../fonts/certFonts';
import type { PreviewFit } from './usePreviewFit';

/**
 * Draws the fitted name onto a canvas, in page points × `scale`, exactly where the PDF renderer
 * places it. Shared by the layout editor and the confirm-screen thumbnail.
 */
export function drawName(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  preview: PreviewFit,
  pageWidthPx: number,
  pageHeightPx: number,
  scale: number,
) {
  const left = layout.nameBox.x * pageWidthPx;
  const top = layout.nameBox.y * pageHeightPx;
  const sizePx = preview.fit.fontSize * scale;
  ctx.fillStyle = layout.color;
  ctx.textBaseline = 'alphabetic';
  for (const line of preview.lines) {
    let x = left + line.x * scale;
    for (const run of splitFontRuns(line.text, layout.font)) {
      ctx.font = runFont(layout.font, run, sizePx);
      ctx.fillText(run.text, x, top + line.baseline * scale);
      x += ctx.measureText(run.text).width;
    }
  }
}

/**
 * A schematic QR code: three finder squares and a deterministic speckle on white. The real code
 * is generated per certificate; this just shows where it will go and how big it is.
 */
export function drawQrPlaceholder(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, size, size);
  const cell = size / 25;
  for (const [cx, cy] of [
    [2, 2],
    [16, 2],
    [2, 16],
  ] as const) {
    ctx.fillStyle = '#111111';
    ctx.fillRect(x + cx * cell, y + cy * cell, 7 * cell, 7 * cell);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + (cx + 1) * cell, y + (cy + 1) * cell, 5 * cell, 5 * cell);
    ctx.fillStyle = '#111111';
    ctx.fillRect(x + (cx + 2) * cell, y + (cy + 2) * cell, 3 * cell, 3 * cell);
  }
  for (let i = 0; i < 60; i++) {
    ctx.fillRect(x + (10 + ((i * 7) % 13)) * cell, y + (10 + ((i * 11) % 13)) * cell, cell, cell);
  }
}
