import { pino } from 'pino';
import { Writable } from 'node:stream';
import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app';
import { resetDatabase, testPrisma } from '../helpers/db';
import { testEnv } from '../helpers/env';
import { CapturingEmailProvider, InMemoryStorage, noopQueue } from '../helpers/fakes';

const prisma = testPrisma();
afterAll(async () => prisma.$disconnect());

describe('logging', () => {
  it('never writes email addresses or one-time codes to the logs', async () => {
    await resetDatabase(prisma);
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk: Buffer, _encoding, done) {
        lines.push(chunk.toString());
        done();
      },
    });
    const email = new CapturingEmailProvider();
    const app = await buildApp({
      env: testEnv(),
      logger: pino({ level: 'trace' }, sink),
      prisma,
      storage: new InMemoryStorage(),
      email,
      queue: noopQueue,
    });

    const address = 'secret.person@example.com';
    await app.inject({ method: 'POST', url: '/api/auth/otp/request', payload: { email: address } });
    const code = email.lastCodeFor(address);
    // A wrong guess, a validation error that echoes input, and the successful sign-in.
    await app.inject({
      method: 'POST',
      url: '/api/auth/otp/verify',
      payload: { email: address, code: '000000' },
    });
    await app.inject({
      method: 'POST',
      url: '/api/auth/otp/verify',
      payload: { email: address, code: 'abc' },
    });
    await app.inject({ method: 'POST', url: '/api/auth/otp/verify', payload: { email: address, code } });
    await app.close();

    const log = lines.join('');
    expect(lines.length).toBeGreaterThan(5); // something was actually logged
    expect(log).toContain('se***@example.com'); // masked form is fine and useful
    expect(log).not.toContain(address);
    expect(log).not.toContain(code);
  });
});
