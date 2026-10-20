import { describe, expect, it } from 'vitest';
import { parseCsv } from './parseCsv';

describe('parseCsv', () => {
  it('parses a simple file with trimmed headers', () => {
    expect(parseCsv(' Full Name , Email \nAna Lima,ana@example.com\n')).toEqual({
      headers: ['Full Name', 'Email'],
      rows: [{ 'Full Name': 'Ana Lima', Email: 'ana@example.com' }],
    });
  });

  it('strips the byte-order mark Excel adds', () => {
    expect(parseCsv('\uFEFFname,email\nAna,a@example.com').headers).toEqual(['name', 'email']);
  });

  it('handles quoted commas and newlines in fields', () => {
    const { rows } = parseCsv('name,email\n"Lima, Ana","a@example.com"\n"O\'Neil\nJr",o@example.com');
    expect(rows.map((r) => r.name)).toEqual(['Lima, Ana', "O'Neil\nJr"]);
  });

  it('detects semicolon-delimited exports', () => {
    expect(parseCsv('name;email\nAna;a@example.com').rows[0]).toEqual({
      name: 'Ana',
      email: 'a@example.com',
    });
  });

  it('skips blank lines', () => {
    expect(parseCsv('name,email\n\nAna,a@example.com\n  \n').rows).toHaveLength(1);
  });

  it('rejects files without data or with duplicate headings', () => {
    expect(() => parseCsv('name,email\n')).toThrow(/no participants/);
    expect(() => parseCsv('')).toThrow(/no header row/);
    expect(() => parseCsv('name,name\nA,B')).toThrow(/same heading/);
  });

  it('rejects more than 1,000 rows', () => {
    const csv = ['name,email', ...Array.from({ length: 1001 }, (_, i) => `P${i},p${i}@example.com`)].join(
      '\n',
    );
    expect(() => parseCsv(csv)).toThrow(/1,001 rows/);
  });
});
