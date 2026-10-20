import { TemplateUploadResponseSchema } from '@certdrop/shared';
import type { FastifyInstance } from 'fastify';

/** Uploads a template through the real presigned flow and returns its ID once verified. */
export async function uploadTemplate(
  app: FastifyInstance,
  cookies: Record<string, string>,
  bytes: Uint8Array,
  contentType: string,
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/uploads/template',
    cookies,
    payload: { contentType, sizeBytes: bytes.length },
  });
  const upload = TemplateUploadResponseSchema.parse(res.json());
  const put = await fetch(upload.uploadUrl, { method: 'PUT', headers: upload.headers, body: bytes });
  if (!put.ok) throw new Error(`Upload failed: ${put.status}`);
  const complete = await app.inject({
    method: 'POST',
    url: `/api/uploads/template/${upload.templateId}/complete`,
    cookies,
  });
  if (complete.statusCode !== 200) throw new Error(`Complete failed: ${complete.body}`);
  return upload.templateId;
}
