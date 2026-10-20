import { MISSING_GLYPHS } from './fontCoverage';
import type { CertFont } from './layout';

export function fontHasGlyph(font: CertFont, codePoint: number): boolean {
  const ranges = MISSING_GLYPHS[font];
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [start, end] = ranges[mid]!;
    if (codePoint < start) hi = mid - 1;
    else if (codePoint > end) lo = mid + 1;
    else return false;
  }
  return true;
}

export interface FontRun {
  text: string;
  /** Drawn in the fallback font (Noto Sans) instead of the chosen one. */
  fallback: boolean;
}

/**
 * Splits a name into runs for the chosen font and the fallback font, a whole word at a time:
 * if any letter of a word is missing from the chosen font, the entire word uses the fallback.
 * Switching typeface mid-word ("Πα" + "π" + "αδό...") looks broken in print; switching between
 * words reads as intentional. Shared so the preview and the PDF make identical choices.
 */
export function splitFontRuns(text: string, font: CertFont): FontRun[] {
  const runs: FontRun[] = [];
  for (const part of text.split(/(\s+)/u)) {
    if (!part) continue;
    const isSpace = /^\s+$/u.test(part);
    // Whitespace joins whichever run it follows, so "Ωμέγα Αλφα" stays one fallback run.
    const fallback = isSpace
      ? (runs.at(-1)?.fallback ?? false)
      : [...part].some((char) => !fontHasGlyph(font, char.codePointAt(0) ?? 0));
    const last = runs.at(-1);
    if (last && last.fallback === fallback) last.text += part;
    else runs.push({ text: part, fallback });
  }
  return runs;
}
