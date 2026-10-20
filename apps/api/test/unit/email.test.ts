import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { formatFrom } from '../../src/email';
import { FileEmailProvider } from '../../src/email/file.provider';
import { escapeHtml } from '../../src/email/templates/layout';
import { otpEmail } from '../../src/email/templates/otp';

describe('formatFrom', () => {
  it('quotes the display name', () => {
    expect(formatFrom('Robotics Club', 'certs@x.dev')).toBe('"Robotics Club" <certs@x.dev>');
  });

  it('strips characters that could inject headers', () => {
    expect(formatFrom('Evil"\r\nBcc: victim@x.dev <a>', 'certs@x.dev')).toBe(
      '"EvilBcc: victim@x.dev a" <certs@x.dev>',
    );
  });

  it('falls back to a default name', () => {
    expect(formatFrom(' "" ', 'certs@x.dev')).toBe('"CertDrop" <certs@x.dev>');
  });
});

describe('escapeHtml', () => {
  it('escapes markup', () => {
    expect(escapeHtml(`<img src=x onerror="alert('1')">&`)).toBe(
      '&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;&amp;',
    );
  });
});

describe('otpEmail', () => {
  it('contains the code in subject, text and HTML', () => {
    const email = otpEmail('a@b.co', '042913');
    expect(email.subject).toContain('042913');
    expect(email.text).toContain('042913');
    expect(email.html).toContain('042913');
    expect(email.text).toContain('10 minutes');
  });
});

describe('FileEmailProvider', () => {
  let dir: string | undefined;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('writes the message and attachments without the recipient in file names', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'certdrop-mail-'));
    const provider = new FileEmailProvider(dir, 'certs@x.dev');
    const { messageId } = await provider.send({
      ...otpEmail('ana@example.com', '123456'),
      attachments: [
        { filename: 'cert.pdf', content: Buffer.from('%PDF-1.7'), contentType: 'application/pdf' },
      ],
    });

    const [folder] = await readdir(dir);
    expect(folder).toContain(messageId);
    expect(folder).not.toContain('ana');
    const files = await readdir(path.join(dir, folder!));
    expect(files.sort()).toEqual(['cert.pdf', 'message.html', 'message.json']);
    const json = JSON.parse(await readFile(path.join(dir, folder!, 'message.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(json).toMatchObject({ to: 'ana@example.com', from: '"CertDrop" <certs@x.dev>' });
  });
});
