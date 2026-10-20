import path from 'node:path';
import type { Env } from '../config/env';
import { FileEmailProvider } from './file.provider';
import { ResendEmailProvider } from './resend.provider';
import type { EmailProvider } from './types';

export * from './types';

export function createEmailProvider(env: Env): EmailProvider {
  switch (env.EMAIL_PROVIDER) {
    case 'resend':
      // loadEnv guarantees the key is present when EMAIL_PROVIDER=resend.
      return new ResendEmailProvider(env.RESEND_API_KEY ?? '', env.EMAIL_FROM_ADDRESS);
    case 'file':
      return new FileEmailProvider(path.resolve(env.MAIL_OUTBOX_DIR), env.EMAIL_FROM_ADDRESS);
  }
}
