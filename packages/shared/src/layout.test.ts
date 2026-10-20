import { describe, expect, it } from 'vitest';
import { BoxSchema, LayoutSchema } from './layout';

describe('BoxSchema', () => {
  it('accepts a box inside the page', () => {
    expect(BoxSchema.safeParse({ x: 0.1, y: 0.4, width: 0.8, height: 0.1 }).success).toBe(true);
  });

  it('rejects a box that spills off the right edge', () => {
    expect(BoxSchema.safeParse({ x: 0.5, y: 0.4, width: 0.6, height: 0.1 }).success).toBe(false);
  });

  it('rejects zero-size boxes', () => {
    expect(BoxSchema.safeParse({ x: 0.1, y: 0.1, width: 0, height: 0.1 }).success).toBe(false);
  });
});

describe('LayoutSchema', () => {
  const valid = {
    nameBox: { x: 0.1, y: 0.4, width: 0.8, height: 0.1 },
    font: 'playfair-display',
    fontSize: 48,
    color: '#1a1a2e',
    align: 'center',
    qrBox: null,
  };

  it('accepts a complete layout', () => {
    expect(LayoutSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects unknown fonts and malformed colours', () => {
    expect(LayoutSchema.safeParse({ ...valid, font: 'comic-sans' }).success).toBe(false);
    expect(LayoutSchema.safeParse({ ...valid, color: 'red' }).success).toBe(false);
  });
});
