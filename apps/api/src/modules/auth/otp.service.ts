import { OTP_POLICY, type Organizer, type OtpRequestResponse } from '@certdrop/shared';
import type { PrismaClient } from '@prisma/client';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { EmailProvider } from '../../email';
import { otpEmail } from '../../email/templates/otp';
import { HttpError } from '../../lib/errors';
import { maskEmail, type Logger } from '../../lib/logger';

export interface OtpServiceDeps {
  prisma: PrismaClient;
  email: EmailProvider;
  otpSecret: string;
  logger: Logger;
  /** Injectable clock so tests can step through expiry and cooldowns. */
  now: () => Date;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * One-time email codes. Organizers have no password: proving they control the inbox is enough,
 * and it stops CertDrop from being used to send certificates "from" someone else's address.
 *
 * Security properties:
 *  - Codes are 6 random digits from a CSPRNG, stored only as an HMAC keyed with OTP_SECRET and
 *    bound to the email, so a database leak reveals nothing usable.
 *  - Only the newest code for an email is valid; it expires after 10 minutes and is single-use.
 *  - 5 wrong guesses lock the code. The attempt counter is incremented atomically *before* the
 *    comparison, so parallel guesses cannot exceed the limit (1M codes / 5 tries = 0.0005% odds).
 *  - Requests are limited per email (60s cooldown, 5 per hour) here, and per IP in the routes.
 */
export class OtpService {
  constructor(private readonly deps: OtpServiceDeps) {}

  async request(email: string): Promise<OtpRequestResponse> {
    const { prisma, logger } = this.deps;
    const now = this.deps.now();

    const latest = await prisma.otpCode.findFirst({ where: { email }, orderBy: { createdAt: 'desc' } });
    if (latest) {
      const waitSeconds = Math.ceil(
        OTP_POLICY.resendCooldownSeconds - (now.getTime() - latest.createdAt.getTime()) / 1000,
      );
      if (waitSeconds > 0) {
        throw new HttpError(
          429,
          'OTP_COOLDOWN',
          `Please wait ${waitSeconds}s before requesting another code.`,
          waitSeconds,
        );
      }
    }

    const sentLastHour = await prisma.otpCode.count({
      where: { email, createdAt: { gt: new Date(now.getTime() - HOUR_MS) } },
    });
    if (sentLastHour >= OTP_POLICY.maxPerEmailPerHour) {
      throw new HttpError(
        429,
        'OTP_HOURLY_LIMIT',
        'Too many codes requested for this email. Try again in an hour.',
      );
    }

    const code = randomInt(0, 10 ** OTP_POLICY.length)
      .toString()
      .padStart(OTP_POLICY.length, '0');
    const [, created] = await prisma.$transaction([
      // Requesting a new code invalidates any earlier one.
      prisma.otpCode.updateMany({ where: { email, consumedAt: null }, data: { consumedAt: now } }),
      prisma.otpCode.create({
        data: {
          email,
          codeHash: this.hash(email, code),
          createdAt: now,
          expiresAt: new Date(now.getTime() + OTP_POLICY.ttlSeconds * 1000),
        },
      }),
    ]);

    try {
      await this.deps.email.send(otpEmail(email, code));
    } catch (err) {
      // Remove the unsent code so the cooldown doesn't block an immediate retry.
      await prisma.otpCode.delete({ where: { id: created.id } });
      logger.error({ err, recipient: maskEmail(email) }, 'failed to send OTP email');
      throw new HttpError(502, 'EMAIL_FAILED', 'We couldn’t send the email. Please try again in a moment.');
    }

    logger.info({ recipient: maskEmail(email) }, 'OTP sent');
    return { expiresInSeconds: OTP_POLICY.ttlSeconds, resendInSeconds: OTP_POLICY.resendCooldownSeconds };
  }

  async verify(email: string, code: string): Promise<Organizer> {
    const { prisma } = this.deps;
    const now = this.deps.now();

    const otp = await prisma.otpCode.findFirst({
      where: { email, consumedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp) {
      throw new HttpError(400, 'OTP_INVALID', 'This code is invalid or has expired. Request a new one.');
    }

    const counted = await prisma.otpCode.updateMany({
      where: { id: otp.id, attempts: { lt: OTP_POLICY.maxAttempts } },
      data: { attempts: { increment: 1 } },
    });
    if (counted.count === 0) {
      throw new HttpError(429, 'OTP_LOCKED', 'Too many incorrect attempts. Request a new code.');
    }

    if (!this.matches(otp.codeHash, email, code)) {
      const remaining = OTP_POLICY.maxAttempts - (otp.attempts + 1);
      if (remaining <= 0) {
        throw new HttpError(429, 'OTP_LOCKED', 'Too many incorrect attempts. Request a new code.');
      }
      throw new HttpError(
        400,
        'OTP_INCORRECT',
        `That code isn’t right. ${remaining} ${remaining === 1 ? 'attempt' : 'attempts'} left.`,
      );
    }

    // Single use: if a parallel request consumed it first, this one loses.
    const consumed = await prisma.otpCode.updateMany({
      where: { id: otp.id, consumedAt: null },
      data: { consumedAt: now },
    });
    if (consumed.count === 0) {
      throw new HttpError(400, 'OTP_INVALID', 'This code has already been used. Request a new one.');
    }

    const organizer = await prisma.organizer.upsert({
      where: { email },
      create: { email, verifiedAt: now },
      update: { verifiedAt: now },
      select: { id: true, email: true },
    });
    this.deps.logger.info({ organizerId: organizer.id }, 'organizer verified');
    return organizer;
  }

  private hash(email: string, code: string): string {
    return createHmac('sha256', this.deps.otpSecret).update(`${email}\u0000${code}`).digest('hex');
  }

  private matches(storedHash: string, email: string, code: string): boolean {
    const expected = Buffer.from(storedHash, 'hex');
    const actual = Buffer.from(this.hash(email, code), 'hex');
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
}
