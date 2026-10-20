import { CERT_FONT_META, FALLBACK_FONT_FILE, type CertFont } from '@certdrop/shared';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Loads each TTF from disk once per process. Rendering a 1,000-row batch reuses the same bytes
 * rather than reading the files 1,000 times.
 */
export class FontLibrary {
  private readonly cache = new Map<string, Promise<Uint8Array>>();

  constructor(private readonly dir: string) {}

  primary(id: CertFont): Promise<Uint8Array> {
    return this.load(CERT_FONT_META[id].file);
  }

  fallback(): Promise<Uint8Array> {
    return this.load(FALLBACK_FONT_FILE);
  }

  private load(file: string): Promise<Uint8Array> {
    let entry = this.cache.get(file);
    if (!entry) {
      entry = readFile(path.join(this.dir, file)).then((buffer) => new Uint8Array(buffer));
      // Don't cache a failed read; the next job gets a fresh attempt.
      entry.catch(() => this.cache.delete(file));
      this.cache.set(file, entry);
    }
    return entry;
  }
}
