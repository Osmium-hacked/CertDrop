import { describe, expect, it } from 'vitest';
import { normalizeCertInput } from './certInput';

describe('normalizeCertInput', () => {
  it.each([
    ['CD-7kQm2xPd9T', 'CD-7kQm2xPd9T'],
    ['  CD-7kQm2xPd9T  ', 'CD-7kQm2xPd9T'],
    ['cd-7kQm2xPd9T', 'CD-7kQm2xPd9T'],
    ['CD-7kQm 2xPd9T', 'CD-7kQm2xPd9T'],
    ['https://certdrop.app/verify/CD-7kQm2xPd9T', 'CD-7kQm2xPd9T'],
    ['http://localhost:5173/verify/cd-7kQm2xPd9T?utm=email#top', 'CD-7kQm2xPd9T'],
  ])('%j → %s', (input, expected) => {
    expect(normalizeCertInput(input)).toBe(expected);
  });

  it('keeps the case of the random part, which is significant', () => {
    expect(normalizeCertInput('CD-abcdefghjk')).toBe('CD-abcdefghjk');
  });
});
