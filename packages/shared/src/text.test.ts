import { describe, expect, it } from 'vitest';
import { findUnsupportedCharacters, normalizeName } from './text';
import { sniffTemplateType } from './template';

describe('normalizeName', () => {
  it('composes combining accents (NFC)', () => {
    const decomposed = 'José';
    expect(normalizeName(decomposed)).toBe('José');
    expect(normalizeName(decomposed)).toHaveLength(4);
  });

  it('trims and collapses whitespace, including tabs and non-breaking spaces', () => {
    expect(normalizeName('\t Ana \u00a0  Lima\n')).toBe('Ana Lima');
  });
});

describe('findUnsupportedCharacters', () => {
  it.each([
    'José Müller',
    'Łukasz Żółć',
    'Nguyễn Thị Ánh',
    'Жанна Иванова',
    'Αλέξης Ωμέγα',
    "Mary-Jane O'Neil",
  ])('accepts %s', (name) => expect(findUnsupportedCharacters(name)).toEqual([]));

  it('flags scripts that need shaping or extra fonts', () => {
    expect(findUnsupportedCharacters('अनन्या')).not.toHaveLength(0);
    expect(findUnsupportedCharacters('محمد')).not.toHaveLength(0);
    expect(findUnsupportedCharacters('王小明')).toEqual(['王', '小', '明']);
  });

  it('flags emoji', () => {
    expect(findUnsupportedCharacters('Ana 🎓')).toEqual(['🎓']);
  });
});

describe('sniffTemplateType', () => {
  const bytes = (...b: number[]) => new Uint8Array([...b, 0, 0, 0, 0]);
  const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

  it('recognizes PNG, JPEG and PDF signatures', () => {
    expect(sniffTemplateType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png');
    expect(sniffTemplateType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(sniffTemplateType(ascii('%PDF-1.7\n'))).toBe('application/pdf');
  });

  it('rejects anything else, regardless of what the file claims to be', () => {
    expect(sniffTemplateType(ascii('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(sniffTemplateType(ascii('GIF89a'))).toBeNull();
    expect(sniffTemplateType(new Uint8Array())).toBeNull();
  });
});
