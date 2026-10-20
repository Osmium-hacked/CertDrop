import { describe, expect, it } from 'vitest';
import { fillPlaceholders } from './batch';
import { detectColumns, sanitizeCell, validateRows, type ColumnMapping } from './csv';

describe('detectColumns', () => {
  it.each([
    [['name', 'email'], 'name', 'email'],
    [['Name', 'Email'], 'Name', 'Email'],
    [['Full Name', 'Email Address'], 'Full Name', 'Email Address'],
    [['FULL_NAME', 'E-mail'], 'FULL_NAME', 'E-mail'],
    [['Timestamp', 'Participant Name', 'Your email', 'Score'], 'Participant Name', 'Your email'],
    [['Attendee', 'Mail'], 'Attendee', 'Mail'],
    [[' Student Name ', 'Student Email'], ' Student Name ', 'Student Email'],
  ])('maps %j', (headers, name, email) => {
    expect(detectColumns(headers)).toEqual({ name, lastName: null, email });
  });

  it('combines first and last name columns', () => {
    expect(detectColumns(['First Name', 'Last Name', 'Email'])).toEqual({
      name: 'First Name',
      lastName: 'Last Name',
      email: 'Email',
    });
    expect(detectColumns(['Given name', 'Surname', 'email'])).toMatchObject({
      name: 'Given name',
      lastName: 'Surname',
    });
  });

  it('prefers a full-name column over first/last', () => {
    expect(detectColumns(['First Name', 'Last Name', 'Full Name', 'Email']).name).toBe('Full Name');
  });

  it('does not mistake other "name" columns for a person', () => {
    expect(detectColumns(['Company Name', 'Event Name', 'Username', 'Email']).name).toBeNull();
  });

  it('returns nulls when nothing matches', () => {
    expect(detectColumns(['col1', 'col2'])).toEqual({ name: null, lastName: null, email: null });
  });
});

describe('sanitizeCell', () => {
  it.each([
    ['=HYPERLINK("http://evil","click")', 'HYPERLINK("http://evil","click")'],
    ['+1+2', '1+2'],
    ['-2+3', '2+3'],
    ['@SUM(A1)', 'SUM(A1)'],
    ['\t=cmd', 'cmd'],
    ['  Ana Lima  ', 'Ana Lima'],
    ['Mary-Jane', 'Mary-Jane'],
  ])('%j → %j', (input, output) => {
    expect(sanitizeCell(input)).toBe(output);
  });

  it('treats missing cells as empty', () => {
    expect(sanitizeCell(undefined)).toBe('');
  });
});

describe('validateRows', () => {
  const mapping: ColumnMapping = { name: 'Name', lastName: null, email: 'Email' };

  it('accepts clean rows and normalizes them', () => {
    const { valid, invalid } = validateRows([{ Name: '  Ana   Lima ', Email: ' Ana@Example.COM ' }], mapping);
    expect(invalid).toHaveLength(0);
    expect(valid[0]).toEqual({ index: 0, name: 'Ana Lima', email: 'ana@example.com', issues: [] });
  });

  it('flags empty names, missing and invalid emails', () => {
    const { rows } = validateRows(
      [
        { Name: '', Email: 'a@example.com' },
        { Name: 'Bo', Email: '' },
        { Name: 'Cy', Email: 'cy@' },
        { Name: 'Di', Email: 'not an email' },
      ],
      mapping,
    );
    expect(rows.map((r) => r.issues)).toEqual([
      ['NAME_MISSING'],
      ['EMAIL_MISSING'],
      ['EMAIL_INVALID'],
      ['EMAIL_INVALID'],
    ]);
  });

  it('flags later duplicates of an email, ignoring case, but keeps the first', () => {
    const { rows, valid } = validateRows(
      [
        { Name: 'Ana', Email: 'ana@example.com' },
        { Name: 'Ana L.', Email: 'ANA@example.com' },
        { Name: 'Bo', Email: 'bo@example.com' },
      ],
      mapping,
    );
    expect(rows[1]!.issues).toEqual(['EMAIL_DUPLICATE']);
    expect(valid.map((r) => r.index)).toEqual([0, 2]);
  });

  it('flags names the renderer cannot print', () => {
    expect(validateRows([{ Name: '王小明', Email: 'w@example.com' }], mapping).rows[0]!.issues).toEqual([
      'NAME_UNSUPPORTED',
    ]);
  });

  it('flags overly long names', () => {
    expect(
      validateRows([{ Name: 'A'.repeat(121), Email: 'a@example.com' }], mapping).rows[0]!.issues,
    ).toEqual(['NAME_TOO_LONG']);
  });

  it('joins first and last name columns', () => {
    const split = { name: 'First', lastName: 'Last', email: 'Email' };
    expect(validateRows([{ First: 'Ana', Last: 'Lima', Email: 'a@example.com' }], split).rows[0]!.name).toBe(
      'Ana Lima',
    );
    // A missing surname is fine: the name is just the first name.
    expect(validateRows([{ First: 'Cher', Last: '', Email: 'c@example.com' }], split).rows[0]!.name).toBe(
      'Cher',
    );
  });

  it('strips formula prefixes from names and emails', () => {
    const { rows } = validateRows([{ Name: '=Ana', Email: '@ana@example.com' }], mapping);
    expect(rows[0]).toMatchObject({ name: 'Ana', email: 'ana@example.com', issues: [] });
  });

  it('applies inline fixes from the organizer', () => {
    const raw = [{ Name: '', Email: 'bad' }];
    expect(validateRows(raw, mapping).invalid).toHaveLength(1);
    const fixed = validateRows(raw, mapping, { 0: { name: 'Ana', email: 'ana@example.com' } });
    expect(fixed.valid[0]).toMatchObject({ name: 'Ana', email: 'ana@example.com' });
  });

  it('reports every row as missing data when the mapping is incomplete', () => {
    const { rows } = validateRows([{ Name: 'Ana', Email: 'a@example.com' }], {
      name: null,
      lastName: null,
      email: null,
    });
    expect(rows[0]!.issues).toEqual(['NAME_MISSING', 'EMAIL_MISSING']);
  });
});

describe('fillPlaceholders', () => {
  it('fills known placeholders and leaves others alone', () => {
    expect(
      fillPlaceholders('Hi {name}, thanks for {event}! {unknown} — {issuer}', {
        name: 'Ana',
        event: 'Hack Day',
        issuer: 'Robotics Club',
      }),
    ).toBe('Hi Ana, thanks for Hack Day! {unknown} — Robotics Club');
  });
});
