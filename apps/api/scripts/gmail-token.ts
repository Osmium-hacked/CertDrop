// Gets the Gmail refresh token for EMAIL_PROVIDER=gmail. Run it once on your own computer.
// Usage: put GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET (a "Desktop app" OAuth client) in apps/api/.env, then
//   pnpm --filter @certdrop/api gmail:token [address-for-a-test-email]
// Open the printed link, sign in with the sending Gmail account and allow access. The token is
// printed here; it's only ever sent to Google.
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { z } from 'zod';
import { GmailEmailProvider } from '../src/email/gmail.provider';

const SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const TIMEOUT_MS = 5 * 60_000;

const clientId = process.env.GMAIL_CLIENT_ID;
const clientSecret = process.env.GMAIL_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error('Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in apps/api/.env first.');
  process.exit(1);
}
const testRecipient = process.argv[2];

// PKCE and state: the code is useless to anyone who intercepts it, and the redirect must be ours.
const verifier = randomBytes(32).toString('base64url');
const challenge = createHash('sha256').update(verifier).digest('base64url');
const state = randomBytes(16).toString('base64url');

const code = await new Promise<{ code: string; redirectUri: string }>((resolve, reject) => {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.pathname !== '/') {
      res.writeHead(404).end();
      return;
    }
    const error = url.searchParams.get('error');
    const received = url.searchParams.get('code');
    const ok = !error && received && url.searchParams.get('state') === state;
    res
      .writeHead(ok ? 200 : 400, { 'Content-Type': 'text/plain; charset=utf-8' })
      .end(ok ? 'Done. You can close this tab and go back to the terminal.' : 'Authorization failed.');
    server.close();
    clearTimeout(timer);
    if (ok) resolve({ code: received, redirectUri });
    else reject(new Error(error ? `Google returned "${error}"` : 'The response did not match this request'));
  });
  let redirectUri = '';
  const timer = setTimeout(() => {
    server.close();
    reject(new Error('Timed out after 5 minutes'));
  }, TIMEOUT_MS);

  // Desktop OAuth clients accept any loopback port, so let the OS pick a free one.
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address() as { port: number };
    redirectUri = `http://127.0.0.1:${port}`;
    const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    auth.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPE,
      // offline + consent: always return a refresh token, even if access was granted before.
      access_type: 'offline',
      prompt: 'consent',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    }).toString();
    console.log(
      `\nOpen this link, sign in with the Gmail account that will send certificates:\n\n${auth.href}\n`,
    );
  });
});

const res = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  body: new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code: code.code,
    code_verifier: verifier,
    redirect_uri: code.redirectUri,
    grant_type: 'authorization_code',
  }),
});
if (!res.ok) {
  console.error(`Token exchange failed (${res.status}): ${await res.text()}`);
  process.exit(1);
}
const { refresh_token: refreshToken } = z.object({ refresh_token: z.string() }).parse(await res.json());

console.log(`GMAIL_REFRESH_TOKEN=${refreshToken}\n`);
console.log('Paste that into Render. Keep it secret: it lets anyone send mail as this account.');

if (testRecipient) {
  const provider = new GmailEmailProvider({ clientId, clientSecret, refreshToken }, testRecipient);
  const { messageId } = await provider.send({
    to: testRecipient,
    fromName: 'CertDrop',
    subject: 'CertDrop test email ✓',
    text: 'Gmail sending works. You can delete this email.',
    html: '<p>Gmail sending works. You can delete this email.</p>',
  });
  console.log(`Test email sent to ${testRecipient} (Gmail message ${messageId}).`);
}
