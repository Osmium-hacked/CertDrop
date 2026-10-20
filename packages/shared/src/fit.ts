import type { TextAlign } from './layout';
import { normalizeName } from './text';

/**
 * Name auto-fit, shared by the browser preview and the PDF renderer so both make the same
 * decision. Each side supplies its own `measure` (canvas measureText vs. the font file's advance
 * widths); because they use the same TTF files, the results agree to within rounding.
 *
 * Rules:
 *  1. Use the layout's font size if the name fits on one line.
 *  2. Otherwise shrink, down to the minimum (60% of the chosen size, at least 8pt).
 *  3. Still too wide: wrap onto two lines at the most balanced space, again no smaller than the
 *     minimum.
 *  4. Still too wide: take whichever of 2 or 3 gives the larger text and flag it, so the editor
 *     can warn the organizer before anything is sent.
 */

/** Width of `text` at font size 1, in the same units as the box (points). */
export type MeasureText = (text: string) => number;

export interface FitBox {
  width: number;
  height: number;
}

export interface FitResult {
  lines: string[];
  fontSize: number;
  /** The name only fits below the minimum size; the editor shows a warning. */
  belowMinimum: boolean;
}

/** Line height as a multiple of the font size. */
export const LINE_HEIGHT = 1.2;
const MIN_SIZE_RATIO = 0.6;
const MIN_SIZE_FLOOR = 8;
/** Below this, text is unreadable on a printed certificate; never go smaller. */
const ABSOLUTE_MIN_SIZE = 4;

export function minFontSize(maxFontSize: number): number {
  return Math.max(MIN_SIZE_FLOOR, Math.round(maxFontSize * MIN_SIZE_RATIO));
}

/** Largest size, at most `max`, at which every line fits the box width and the block fits its height. */
function sizeFor(lines: string[], box: FitBox, max: number, measure: MeasureText): number {
  const widest = Math.max(...lines.map(measure));
  const byWidth = widest > 0 ? box.width / widest : Infinity;
  const byHeight = box.height / (lines.length * LINE_HEIGHT);
  // Round down to 0.1pt so the result is stable and never exceeds the box.
  return Math.floor(Math.min(max, byWidth, byHeight) * 10) / 10;
}

/** The split at a space that minimizes the wider of the two lines, or null for a single word. */
export function balancedSplit(text: string, measure: MeasureText): [string, string] | null {
  let best: [string, string] | null = null;
  let bestWidth = Infinity;
  for (let i = text.indexOf(' '); i !== -1; i = text.indexOf(' ', i + 1)) {
    const pair: [string, string] = [text.slice(0, i), text.slice(i + 1)];
    const width = Math.max(measure(pair[0]), measure(pair[1]));
    if (width < bestWidth) {
      best = pair;
      bestWidth = width;
    }
  }
  return best;
}

export function fitName(name: string, box: FitBox, maxFontSize: number, measure: MeasureText): FitResult {
  const text = normalizeName(name);
  const min = minFontSize(maxFontSize);

  const singleSize = sizeFor([text], box, maxFontSize, measure);
  if (singleSize >= min) return { lines: [text], fontSize: singleSize, belowMinimum: false };

  const split = balancedSplit(text, measure);
  const splitSize = split ? sizeFor(split, box, maxFontSize, measure) : 0;
  if (split && splitSize >= min) return { lines: split, fontSize: splitSize, belowMinimum: false };

  const useSplit = split !== null && splitSize > singleSize;
  return {
    lines: useSplit ? split : [text],
    fontSize: Math.max(useSplit ? splitSize : singleSize, ABSOLUTE_MIN_SIZE),
    belowMinimum: true,
  };
}

export interface FontMetrics {
  /** Ascender and descender as fractions of the font size (descent is negative). */
  ascent: number;
  descent: number;
}

export interface PositionedLine {
  text: string;
  /** Left edge of the line, from the box's left edge. */
  x: number;
  /** Baseline, measured down from the box's top edge. */
  baseline: number;
  width: number;
}

/**
 * Places fitted lines inside the box: block centred vertically, each line aligned horizontally.
 * Coordinates are top-down; the PDF renderer flips them to PDF's bottom-up system.
 */
export function positionLines(
  fit: FitResult,
  box: FitBox,
  align: TextAlign,
  measure: MeasureText,
  metrics: FontMetrics,
): PositionedLine[] {
  const lineHeight = fit.fontSize * LINE_HEIGHT;
  const blockTop = (box.height - lineHeight * fit.lines.length) / 2;
  // Centre the glyphs' ascent-to-descent band within each line box.
  const glyphHeight = (metrics.ascent - metrics.descent) * fit.fontSize;
  const baselineInLine = (lineHeight - glyphHeight) / 2 + metrics.ascent * fit.fontSize;

  return fit.lines.map((text, i) => {
    const width = measure(text) * fit.fontSize;
    const x = align === 'left' ? 0 : align === 'right' ? box.width - width : (box.width - width) / 2;
    return { text, x, baseline: blockTop + i * lineHeight + baselineInLine, width };
  });
}
