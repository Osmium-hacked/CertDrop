import { expect, test } from '@playwright/test';
import { waitForEmail } from './outbox';

// One organizer journey from sign-in to a recipient verifying their certificate, using the seed
// template and the demo CSV (10 valid rows, 4 that need fixing).
test('an organizer sends certificates and a recipient verifies one', async ({ page }) => {
  const startedAt = Date.now();
  const organizer = `e2e-${startedAt}@example.com`;
  // Against `vite preview` the production CSP applies; anything it blocks would break real users.
  const cspViolations: string[] = [];
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    // Printed so CI logs show what the browser saw when something fails.
    console.log(`[browser] ${message.text()}`);
    if (/Content Security Policy/i.test(message.text())) cspViolations.push(message.text());
  });
  page.on('pageerror', (error) => console.log(`[browser pageerror] ${error.message}`));

  // Step 1: sign in with a one-time code.
  await page.goto('/');
  await page.getByLabel('Your email').fill(organizer);
  const sendCode = page.getByRole('button', { name: 'Send code' });
  await expect(sendCode).toBeEnabled(); // waits for Turnstile when it's configured
  await sendCode.click();

  const otp = await waitForEmail(organizer, startedAt);
  const code = /\b(\d{6})\b/.exec(otp.subject)?.[1];
  expect(code, 'code in subject').toBeTruthy();
  await page.getByLabel('6-digit code').fill(code!);

  // Step 2: template and layout.
  await expect(page.getByRole('heading', { name: 'Upload your certificate design' })).toBeVisible();
  await page.locator('input[type=file]').setInputFiles('seed/sample-template.pdf');
  await expect(page.getByRole('application', { name: /Certificate layout editor/ })).toBeVisible();
  await page.getByRole('switch', { name: 'Add a verification QR code' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 3: participants and event details.
  await expect(page.getByRole('heading', { name: 'Add your participants' })).toBeVisible();
  await page.locator('input[type=file]').setInputFiles('seed/sample-participants.csv');
  await expect(page.getByText('need fixing', { exact: true })).toBeVisible();
  await page.getByLabel(/Skip the 4 rows/).check();
  await page.getByLabel('Event name').fill('E2E Hackathon');
  await page.getByLabel('Issued by').fill('Playwright Club');
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 4: confirm, send, watch progress.
  const send = page.getByRole('button', { name: 'Generate & send 10 certificates' });
  await expect(send).toBeVisible();
  await send.click();
  await expect(page.getByText('All sent')).toBeVisible({ timeout: 60_000 });

  // A recipient opens the verification link from their email.
  const certificateEmail = await waitForEmail('ana.lima@example.com', startedAt);
  expect(certificateEmail.subject).toBe('Your certificate for E2E Hackathon');
  const verifyUrl = /Verify this certificate: (\S+)/.exec(certificateEmail.text)?.[1];
  expect(verifyUrl).toMatch(/\/verify\/CD-[A-Za-z0-9]{10}$/);

  // The link uses PUBLIC_APP_URL; open its path on whichever server this run targets.
  await page.goto(new URL(verifyUrl!).pathname);
  await expect(page.getByText('Valid certificate')).toBeVisible();
  await expect(page.getByText('Ana Lima')).toBeVisible();
  await expect(page.getByText('Playwright Club').first()).toBeVisible();

  expect(cspViolations, 'Content Security Policy violations').toEqual([]);
});
