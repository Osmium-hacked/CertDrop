import { describe, expect, it } from 'vitest';
import { fontHasGlyph, splitFontRuns } from './runs';

describe('splitFontRuns', () => {
  it('keeps names the font covers in a single run', () => {
    expect(splitFontRuns('Łukasz Żółć', 'playfair-display')).toEqual([
      { text: 'Łukasz Żółć', fallback: false },
    ]);
  });

  it('moves whole words to the fallback font, never part of a word', () => {
    // Playfair Display has π (it doubles as the maths symbol) but no other Greek letters. Drawn
    // per character, π would stay in Playfair mid-word; per word, the whole word falls back.
    expect(fontHasGlyph('playfair-display', 'π'.codePointAt(0)!)).toBe(true);
    expect(fontHasGlyph('playfair-display', 'α'.codePointAt(0)!)).toBe(false);
    expect(splitFontRuns('Ana Παπαδόπουλος', 'playfair-display')).toEqual([
      { text: 'Ana ', fallback: false },
      { text: 'Παπαδόπουλος', fallback: true },
    ]);
  });

  it('merges consecutive fallback words, including the space between them', () => {
    expect(splitFontRuns('Αλέξης Παπαδόπουλος', 'great-vibes')).toEqual([
      { text: 'Αλέξης Παπαδόπουλος', fallback: true },
    ]);
  });
});
