import path from 'node:path';
import type { Env } from '../config/env';
import { FileEmailProvider } from './file.provider';
import { GmailEmailProvider } from './gmail.provider';
import { ResendEmailProvider } from './resend.provider';
import type { EmailProvider } from './types';

export * from './types';

export function createEmailProvider(env: Env): EmailProvider {
  switch (env.EMAIL_PROVIDER) {
    case 'resend':
      // loadEnv guarantees the key is present when EMAIL_PROVIDER=resend.
      return new ResendEmailProvider(env.RESEND_API_KEY ?? '', env.EMAIL_FROM_ADDRESS);
    case 'gmail':
      // Likewise for the three Gmail credentials.
      return new GmailEmailProvider(
        {
          clientId: env.GMAIL_CLIENT_ID ?? '',
          clientSecret: env.GMAIL_CLIENT_SECRET ?? '',
          refreshToken: env.GMAIL_REFRESH_TOKEN ?? '',
        },
        env.EMAIL_FROM_ADDRESS,
      );
    case 'file':
      return new FileEmailProvider(path.resolve(env.MAIL_OUTBOX_DIR), env.EMAIL_FROM_ADDRESS);
  }
}
