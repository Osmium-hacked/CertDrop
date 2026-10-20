/**
 * Canonical form of a recipient name: Unicode NFC (so "é" typed as e + combining accent becomes
 * one character), trimmed, with runs of whitespace collapsed to a single space.
 */
export function normalizeName(name: string): string {
  return name.normalize('NFC').replace(/\s+/gu, ' ').trim();
}

/**
 * Unicode ranges the bundled fonts cover and that need no complex text shaping:
 * Latin (incl. Vietnamese), Greek and Cyrillic, plus common punctuation.
 */
const SUPPORTED_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0020, 0x007e], // Basic Latin (printable)
  [0x00a0, 0x00ff], // Latin-1 Supplement
  [0x0100, 0x024f], // Latin Extended-A and -B
  [0x0250, 0x02ff], // IPA extensions, spacing modifier letters
  [0x0300, 0x036f], // Combining diacritical marks
  [0x0370, 0x03ff], // Greek and Coptic
  [0x0400, 0x052f], // Cyrillic and Cyrillic Supplement
  [0x1e00, 0x1eff], // Latin Extended Additional (Vietnamese)
  [0x1f00, 0x1fff], // Greek Extended
  [0x2000, 0x206f], // General punctuation (dashes, quotes, zero-width joiners)
];

/**
 * Characters the certificate renderer cannot draw correctly. pdf-lib places glyphs one after
 * another without shaping, so scripts that join or reorder letters (Arabic, Devanagari, Thai...)
 * would come out wrong, and CJK isn't in the bundled fonts. Rows with such names are flagged for
 * the organizer instead of producing a broken certificate.
 */
export function findUnsupportedCharacters(text: string): string[] {
  const found = new Set<string>();
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (!SUPPORTED_RANGES.some(([lo, hi]) => code >= lo && code <= hi)) found.add(char);
  }
  return [...found];
}
