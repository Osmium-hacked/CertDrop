import { describe, expect, it } from 'vitest';
import { balancedSplit, fitName, LINE_HEIGHT, minFontSize, positionLines, type MeasureText } from './fit';

/** Monospace stand-in for a real font: every character is 0.5em wide. */
const mono: MeasureText = (text) => [...text].length * 0.5;

const box = { width: 300, height: 100 };

describe('fitName', () => {
  it('keeps the requested size when the name fits', () => {
    // "Ana Lima" = 8 chars → 4em wide → 160pt at 40pt, inside 300pt.
    expect(fitName('Ana Lima', box, 40, mono)).toEqual({
      lines: ['Ana Lima'],
      fontSize: 40,
      belowMinimum: false,
    });
  });

  it('shrinks a long name to fit on one line when that stays above the minimum', () => {
    // 20 chars → 10em → 300pt fits at 30pt; minimum for 40pt is 24pt.
    const fit = fitName('Alexandra Montgomery', box, 40, mono);
    expect(fit.lines).toEqual(['Alexandra Montgomery']);
    expect(fit.fontSize).toBe(30);
    expect(fit.belowMinimum).toBe(false);
  });

  it('wraps to two balanced lines before going below the minimum', () => {
    // 40 chars on one line would need 15pt (< 24pt minimum). The best split's wider line is
    // 24 chars → 12em → 25pt, which is above the minimum.
    const fit = fitName('Maria Fernanda Rodrigues da Silva Santos', box, 40, mono);
    expect(fit.lines).toEqual(['Maria Fernanda Rodrigues', 'da Silva Santos']);
    expect(fit.fontSize).toBe(25);
    expect(fit.fontSize).toBeGreaterThanOrEqual(minFontSize(40));
    expect(fit.belowMinimum).toBe(false);
  });

  it('flags names that only fit below the minimum', () => {
    const fit = fitName('Supercalifragilisticexpialidociousness', { width: 100, height: 100 }, 40, mono);
    expect(fit.lines).toHaveLength(1); // no space to wrap at
    expect(fit.belowMinimum).toBe(true);
    expect(fit.fontSize).toBeLessThan(minFontSize(40));
  });

  it('respects the box height', () => {
    const fit = fitName('Ana', { width: 300, height: 24 }, 40, mono);
    expect(fit.fontSize).toBe(20); // 24 / 1.2
  });

  it('never exceeds the box width or height', () => {
    const names = ['A', 'Jo', 'José María Fernández de la Peña', 'Łukasz Żółć', 'Nguyễn Thị Minh Khai'];
    for (const name of names) {
      const fit = fitName(name, box, 72, mono);
      for (const line of fit.lines) expect(mono(line) * fit.fontSize).toBeLessThanOrEqual(box.width);
      expect(fit.lines.length * fit.fontSize * LINE_HEIGHT).toBeLessThanOrEqual(box.height + 1e-9);
    }
  });

  it('normalizes whitespace and Unicode before fitting', () => {
    expect(fitName('  José   Lima ', box, 40, mono).lines).toEqual(['José Lima']);
  });
});

describe('balancedSplit', () => {
  it('picks the split that minimizes the wider line', () => {
    expect(balancedSplit('Mary Ann Elizabeth Smith', mono)).toEqual(['Mary Ann', 'Elizabeth Smith']);
  });

  it('returns null for a single word', () => {
    expect(balancedSplit('Cher', mono)).toBeNull();
  });
});

describe('positionLines', () => {
  const metrics = { ascent: 0.9, descent: -0.2 };

  it('centres a single line horizontally and vertically', () => {
    const fit = { lines: ['Ana'], fontSize: 40, belowMinimum: false };
    const [line] = positionLines(fit, box, 'center', mono, metrics);
    expect(line!.width).toBe(60);
    expect(line!.x).toBe(120);
    // Line box 48pt tall, starting at (100 - 48) / 2 = 26; glyph band 44pt centred → baseline 26 + 2 + 36.
    expect(line!.baseline).toBeCloseTo(64);
  });

  it('aligns left and right', () => {
    const fit = { lines: ['Ana'], fontSize: 40, belowMinimum: false };
    expect(positionLines(fit, box, 'left', mono, metrics)[0]!.x).toBe(0);
    expect(positionLines(fit, box, 'right', mono, metrics)[0]!.x).toBe(240);
  });

  it('stacks two lines one line-height apart', () => {
    const fit = { lines: ['Mary Ann', 'Smith'], fontSize: 20, belowMinimum: false };
    const [a, b] = positionLines(fit, box, 'center', mono, metrics);
    expect(b!.baseline - a!.baseline).toBeCloseTo(20 * LINE_HEIGHT);
  });
});
