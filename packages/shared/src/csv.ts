import { EmailSchema } from './auth';
import { findUnsupportedCharacters, normalizeName } from './text';

/** Hard cap per batch, enforced in the browser and again by the API. */
export const BATCH_MAX_ROWS = 1000;
export const NAME_MAX_LENGTH = 120;

/** Which CSV columns hold the name and email. `lastName` joins a separate surname column. */
export interface ColumnMapping {
  name: string | null;
  lastName: string | null;
  email: string | null;
}

/** "Full Name " → "fullname", "E-mail Address" → "emailaddress". */
const normalizeHeader = (header: string) => header.toLowerCase().replace(/[^a-z0-9]/g, '');

const FULL_NAME_HEADERS = [
  'name',
  'fullname',
  'namefull',
  'participantname',
  'participant',
  'recipientname',
  'recipient',
  'attendeename',
  'attendee',
  'studentname',
  'student',
  'candidatename',
  'membername',
  'displayname',
  'nameoncertificate',
  'certificatename',
];
const FIRST_NAME_HEADERS = ['firstname', 'givenname', 'forename', 'first'];
const LAST_NAME_HEADERS = ['lastname', 'surname', 'familyname', 'last'];
const EMAIL_HEADERS = [
  'email',
  'emailaddress',
  'mail',
  'emailid',
  'participantemail',
  'attendeeemail',
  'studentemail',
];
/** Headers that contain "name" but are not a person's name. */
const NOT_A_PERSON =
  /user|company|organi[sz]ation|org|event|file|school|team|course|first|last|given|family|sur/;

function findHeader(headers: string[], candidates: string[]): string | null {
  for (const candidate of candidates) {
    const match = headers.find((h) => normalizeHeader(h) === candidate);
    if (match !== undefined) return match;
  }
  return null;
}

/**
 * Guesses the name and email columns from the header row. Exact (normalized) matches win; then a
 * first/last name pair; then any header mentioning "name" or "email". The organizer can always
 * remap in the UI.
 */
export function detectColumns(headers: string[]): ColumnMapping {
  const email =
    findHeader(headers, EMAIL_HEADERS) ?? headers.find((h) => normalizeHeader(h).includes('email')) ?? null;

  const fullName = findHeader(headers, FULL_NAME_HEADERS);
  if (fullName) return { name: fullName, lastName: null, email };

  const first = findHeader(headers, FIRST_NAME_HEADERS);
  const last = findHeader(headers, LAST_NAME_HEADERS);
  if (first) return { name: first, lastName: last, email };

  const loose = headers.find((h) => {
    const n = normalizeHeader(h);
    return n.includes('name') && !NOT_A_PERSON.test(n);
  });
  return { name: loose ?? null, lastName: null, email };
}

/**
 * Neutralizes spreadsheet formula injection: a cell starting with = + - @ (or a tab/CR that
 * some spreadsheets treat the same way) could execute if the data is ever exported back to
 * Excel or Sheets. Names and emails never legitimately start with these.
 */
export function sanitizeCell(value: string | undefined): string {
  return (value ?? '').replace(/^[\s=+\-@\t\r]+/u, '').trim();
}

export type RowIssue =
  | 'NAME_MISSING'
  | 'NAME_TOO_LONG'
  | 'NAME_UNSUPPORTED'
  | 'EMAIL_MISSING'
  | 'EMAIL_INVALID'
  | 'EMAIL_DUPLICATE';

export const ROW_ISSUE_LABELS: Record<RowIssue, string> = {
  NAME_MISSING: 'Name is empty',
  NAME_TOO_LONG: `Name is longer than ${NAME_MAX_LENGTH} characters`,
  NAME_UNSUPPORTED: 'Name has characters that can’t be printed',
  EMAIL_MISSING: 'Email is empty',
  EMAIL_INVALID: 'Email isn’t valid',
  EMAIL_DUPLICATE: 'Same email as an earlier row',
};

export interface ParticipantRow {
  /** 0-based position among the CSV's data rows (excluding the header). */
  index: number;
  name: string;
  email: string;
  issues: RowIssue[];
}

export interface RowOverride {
  name?: string;
  email?: string;
}

export interface ValidationResult {
  rows: ParticipantRow[];
  valid: ParticipantRow[];
  invalid: ParticipantRow[];
}

/**
 * Applies the mapping (and any inline fixes the organizer made) to raw CSV rows, then checks
 * every row. Only the first occurrence of an email is valid; later ones are flagged as
 * duplicates so nobody receives two certificates.
 */
export function validateRows(
  raw: ReadonlyArray<Record<string, string | undefined>>,
  mapping: ColumnMapping,
  overrides: Readonly<Record<number, RowOverride>> = {},
): ValidationResult {
  const seenEmails = new Set<string>();
  const rows = raw.map((record, index): ParticipantRow => {
    const override = overrides[index] ?? {};
    const mappedName = [mapping.name, mapping.lastName]
      .filter((column): column is string => Boolean(column))
      .map((column) => sanitizeCell(record[column]))
      .join(' ');
    const name = normalizeName(override.name ?? mappedName);
    const email = sanitizeCell(override.email ?? (mapping.email ? record[mapping.email] : '')).toLowerCase();

    const issues: RowIssue[] = [];
    if (!name) issues.push('NAME_MISSING');
    else if (name.length > NAME_MAX_LENGTH) issues.push('NAME_TOO_LONG');
    else if (findUnsupportedCharacters(name).length > 0) issues.push('NAME_UNSUPPORTED');

    if (!email) issues.push('EMAIL_MISSING');
    else if (!EmailSchema.safeParse(email).success) issues.push('EMAIL_INVALID');
    else if (seenEmails.has(email)) issues.push('EMAIL_DUPLICATE');
    else seenEmails.add(email);

    return { index, name, email, issues };
  });

  return {
    rows,
    valid: rows.filter((r) => r.issues.length === 0),
    invalid: rows.filter((r) => r.issues.length > 0),
  };
}
