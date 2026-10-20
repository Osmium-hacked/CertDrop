import { TemplateUploadResponseSchema } from '@certdrop/shared';
import type { FastifyInstance } from 'fastify';
import { pino } from 'pino';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app';
import { createS3Storage, type S3Storage } from '../../src/lib/storage';
import { signIn } from '../helpers/auth';
import { resetDatabase, testPrisma } from '../helpers/db';
import { TEST_STORAGE_ENV, testEnv } from '../helpers/env';
import { CapturingEmailProvider } from '../helpers/fakes';
import { jpegFixture, makePdf, makePng } from '../helpers/files';

const prisma = testPrisma();
const env = testEnv(TEST_STORAGE_ENV);
const storage: S3Storage = createS3Storage(env);

let app: FastifyInstance;
let email: CapturingEmailProvider;
let cookies: Record<string, string>;

beforeEach(async () => {
  await resetDatabase(prisma);
  email = new CapturingEmailProvider();
  app = await buildApp({ env, logger: pino({ level: 'silent' }), prisma, storage, email });
  cookies = await signIn(app, email, 'organizer@example.com');
});

afterEach(async () => app.close());
afterAll(async () => prisma.$disconnect());

async function requestUpload(contentType: string, sizeBytes: number, as = cookies) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/uploads/template',
    cookies: as,
    payload: { contentType, sizeBytes },
  });
  return { res, body: res.statusCode === 200 ? TemplateUploadResponseSchema.parse(res.json()) : null };
}

/** What the browser does: PUT straight to storage with the signed headers. */
function put(upload: { uploadUrl: string; headers: Record<string, string> }, bytes: Uint8Array) {
  return fetch(upload.uploadUrl, { method: 'PUT', headers: upload.headers, body: bytes });
}

const complete = (templateId: string, as = cookies) =>
  app.inject({ method: 'POST', url: `/api/uploads/template/${templateId}/complete`, cookies: as });

describe('template upload', () => {
  it.each([
    ['PNG', 'image/png', () => Promise.resolve(makePng(1200, 848)), 842],
    ['JPEG', 'image/jpeg', () => Promise.resolve(jpegFixture()), 842],
    ['PDF', 'application/pdf', () => makePdf([[792, 612]]), 792],
  ])('accepts a valid %s through the presigned flow', async (_label, type, build, expectedWidth) => {
    const bytes = await build();
    const { body: upload } = await requestUpload(type, bytes.length);
    expect(upload!.uploadUrl).toContain('X-Amz-Signature');

    expect((await put(upload!, bytes)).status).toBe(200);

    const res = await complete(upload!.templateId);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      template: { id: upload!.templateId, mimeType: type, widthPt: expectedWidth },
    });

    const row = await prisma.template.findUniqueOrThrow({ where: { id: upload!.templateId } });
    expect(row.status).toBe('READY');
    // Completing again is harmless.
    expect((await complete(upload!.templateId)).statusCode).toBe(200);
  });

  it('requires a verified organizer', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/uploads/template',
      payload: { contentType: 'image/png', sizeBytes: 100 },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
  });

  it('rejects unsupported types and files over 10 MB before issuing a URL', async () => {
    expect((await requestUpload('image/svg+xml', 100)).res.statusCode).toBe(400);
    expect((await requestUpload('image/png', 10 * 1024 * 1024 + 1)).res.statusCode).toBe(400);
    expect(await prisma.template.count()).toBe(0);
  });

  it('storage refuses an upload whose size differs from the signed one', async () => {
    const bytes = makePng(1200, 848);
    const { body: upload } = await requestUpload('image/png', bytes.length);
    const bigger = new Uint8Array(bytes.length + 1000);
    bigger.set(bytes);
    expect((await put(upload!, bigger)).status).toBe(403);
  });

  it('rejects a file whose contents do not match its declared type, and deletes it', async () => {
    const pdf = await makePdf([[842, 595]]);
    const { body: upload } = await requestUpload('image/png', pdf.length);
    await put(upload!, pdf);
    const { storageKey } = await prisma.template.findUniqueOrThrow({ where: { id: upload!.templateId } });
    expect(await storage.head(storageKey)).not.toBeNull();

    const res = await complete(upload!.templateId);
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ error: { code: 'TEMPLATE_INVALID' } });
    expect(await prisma.template.count()).toBe(0);
    expect(await storage.head(storageKey)).toBeNull();
  });

  it('reports a missing upload so the browser can retry', async () => {
    const { body: upload } = await requestUpload('image/png', 1234);
    const res = await complete(upload!.templateId);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: { code: 'UPLOAD_MISSING' } });
  });

  it("does not let one organizer complete another organizer's template", async () => {
    const bytes = makePng(1200, 848);
    const { body: upload } = await requestUpload('image/png', bytes.length);
    await put(upload!, bytes);

    const intruder = await signIn(app, email, 'someone-else@example.com');
    const res = await complete(upload!.templateId, intruder);
    expect(res.statusCode).toBe(404);
  });
});
