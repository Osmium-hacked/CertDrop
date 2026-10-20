import { BATCH_MAX_ROWS } from '@certdrop/shared';
import Papa from 'papaparse';

export const CSV_MAX_BYTES = 2 * 1024 * 1024;

export interface ParsedCsv {
  headers: string[];
  rows: Array<Record<string, string>>;
}

export class CsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvError';
  }
}

/**
 * Parses CSV text in the browser: nothing is uploaded until the batch is created. Papa Parse
 * detects the delimiter, so semicolon-separated exports from European Excel work too.
 */
export function parseCsv(text: string): ParsedCsv {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    // Excel adds a UTF-8 byte-order mark; strip it so the first header matches.
    transformHeader: (header) => header.replace(/^\uFEFF/, '').trim(),
  });

  const headers = (result.meta.fields ?? []).filter((h) => h.length > 0);
  if (headers.length === 0) throw new CsvError('The file has no header row. Add one, e.g. "name,email".');
  // Papa Parse quietly renames duplicates ("name", "name_1"); refuse instead, since guessing which
  // column is the real one could put the wrong data on certificates.
  if (Object.keys(result.meta.renamedHeaders ?? {}).length > 0) {
    throw new CsvError('Two columns have the same heading. Rename one and upload again.');
  }

  // Row-level quirks (a missing trailing comma, an extra field) are tolerated; anything that
  // stopped parsing altogether is not.
  const fatal = result.errors.find((e) => e.type === 'Quotes');
  if (fatal) {
    throw new CsvError(`Row ${(fatal.row ?? 0) + 2} has an unclosed quote. Check the file and try again.`);
  }

  if (result.data.length === 0) throw new CsvError('The file has headings but no participants.');
  if (result.data.length > BATCH_MAX_ROWS) {
    throw new CsvError(
      `The file has ${result.data.length.toLocaleString()} rows; a batch can have up to ${BATCH_MAX_ROWS.toLocaleString()}. Split it into smaller files.`,
    );
  }
  return { headers, rows: result.data };
}

export async function readCsvFile(file: File): Promise<ParsedCsv> {
  if (file.size > CSV_MAX_BYTES) throw new CsvError('That file is over 2 MB. Is it the right CSV?');
  return parseCsv(await file.text());
}
