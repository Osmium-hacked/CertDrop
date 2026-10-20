import { z } from 'zod';

/** Proves a human asked for an OTP email, so the endpoint can't be scripted to spam inboxes. */
export interface CaptchaVerifier {
  readonly enabled: boolean;
  /** true = human; false = missing or rejected token. Throws if the check itself couldn't run. */
  verify(token: string | undefined, ip: string): Promise<boolean>;
}

export class CaptchaUnavailableError extends Error {
  constructor(cause: unknown) {
    super('Captcha verification service unavailable', { cause });
    this.name = 'CaptchaUnavailableError';
  }
}

const SiteverifySchema = z.object({ success: z.boolean() });

/** Cloudflare Turnstile. Docs: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/ */
export class TurnstileVerifier implements CaptchaVerifier {
  readonly enabled = true;

  constructor(private readonly secret: string) {}

  async verify(token: string | undefined, ip: string): Promise<boolean> {
    if (!token) return false;
    try {
      const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: new URLSearchParams({ secret: this.secret, response: token, remoteip: ip }),
        signal: AbortSignal.timeout(5_000),
      });
      return SiteverifySchema.parse(await res.json()).success;
    } catch (err) {
      // Fail closed: if Cloudflare can't be reached, nobody gets a code (rather than everybody).
      throw new CaptchaUnavailableError(err);
    }
  }
}

/** Local development and tests without a Turnstile secret. Production refuses to start like this. */
export const disabledCaptcha: CaptchaVerifier = {
  enabled: false,
  verify: () => Promise.resolve(true),
};
