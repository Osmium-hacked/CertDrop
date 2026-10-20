import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

/** Where the API's file email provider writes (MAIL_OUTBOX_DIR, relative to apps/api). */
const OUTBOX = path.resolve(process.env.E2E_OUTBOX ?? 'apps/api/.mail-outbox');

interface OutboxMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * Waits for the newest email to `to` written after `since`. Folder names start with the write
 * time in milliseconds, so older runs' emails are ignored.
 */
export async function waitForEmail(to: string, since: number, timeoutMs = 20_000): Promise<OutboxMessage> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const folders = (await readdir(OUTBOX).catch(() => [] as string[]))
      .filter((name) => Number(name.split('-')[0]) >= since)
      .sort()
      .reverse();
    for (const folder of folders) {
      const message = JSON.parse(
        await readFile(path.join(OUTBOX, folder, 'message.json'), 'utf8'),
      ) as OutboxMessage;
      if (message.to === to) return message;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No email to ${to} in ${OUTBOX} within ${timeoutMs}ms`);
}
