import fontkit from '@pdf-lib/fontkit';
import { CERT_FONT_META, FALLBACK_FONT_FILE, findUnsupportedCharacters } from '@certdrop/shared';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const FONTS_DIR = path.resolve(import.meta.dirname, '../../../../packages/shared/fonts');
const load = (file: string) => fontkit.create(readFileSync(path.join(FONTS_DIR, file)));

describe('bundled certificate fonts', () => {
  it.each(Object.values(CERT_FONT_META))('$label metrics match the font file', (meta) => {
    const font = load(meta.file);
    expect(meta.metrics.ascent).toBeCloseTo(font.ascent / font.unitsPerEm, 3);
    expect(meta.metrics.descent).toBeCloseTo(font.descent / font.unitsPerEm, 3);
  });

  it('every supported character is covered by the chosen font or the fallback', () => {
    const fallback = load(FALLBACK_FONT_FILE);
    const sample = 'José Müller Łukasz Żółć Nguyễn Thị Ánh Жанна Иванова Αλέξης Ωμέγα ß Ø Œ ’–';
    expect(findUnsupportedCharacters(sample)).toEqual([]);

    for (const meta of Object.values(CERT_FONT_META)) {
      const font = load(meta.file);
      const missing = [...sample].filter((ch) => {
        const cp = ch.codePointAt(0)!;
        return ch !== ' ' && !font.hasGlyphForCodePoint(cp) && !fallback.hasGlyphForCodePoint(cp);
      });
      expect(missing, meta.label).toEqual([]);
    }
  });
});
