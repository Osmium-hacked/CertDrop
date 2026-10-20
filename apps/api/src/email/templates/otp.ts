import { OTP_POLICY } from '@certdrop/shared';
import type { EmailMessage } from '../types';
import { emailLayout } from './layout';

const FOOTER =
  'You received this because someone entered this address on CertDrop. If it wasn’t you, ignore this email: nothing happens without the code.';

export function otpEmail(to: string, code: string): EmailMessage {
  const minutes = OTP_POLICY.ttlSeconds / 60;
  return {
    to,
    fromName: 'CertDrop',
    subject: `${code} is your CertDrop code`,
    text: [
      `Your CertDrop verification code is ${code}.`,
      '',
      `It expires in ${minutes} minutes. Never share this code with anyone.`,
      '',
      FOOTER,
    ].join('\n'),
    html: emailLayout(
      `<p style="margin:0 0 8px;font-size:15px;line-height:22px;">Your CertDrop verification code:</p>
      <p style="margin:0 0 20px;font-size:32px;line-height:40px;font-weight:600;letter-spacing:6px;font-family:'SFMono-Regular',Menlo,Consolas,monospace;">${code}</p>
      <p style="margin:0;font-size:14px;line-height:21px;color:#52525b;">It expires in ${minutes} minutes. Never share this code with anyone.</p>`,
      FOOTER,
    ),
  };
}
