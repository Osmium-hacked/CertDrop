import { z } from 'zod';

export const TEMPLATE_MAX_BYTES = 10 * 1024 * 1024;
export const TEMPLATE_MIME_TYPES = ['image/png', 'image/jpeg', 'application/pdf'] as const;
export const TemplateMimeTypeSchema = z.enum(TEMPLATE_MIME_TYPES);
export type TemplateMimeType = z.infer<typeof TemplateMimeTypeSchema>;

/**
 * Image templates are placed on a page whose longer side is this many points (A4). Fixing the
 * page size means "48pt" looks the same on a 1,000px export and a 4,000px one. PDF templates
 * keep their own page size.
 */
export const IMAGE_TEMPLATE_LONG_SIDE_PT = 842;

/**
 * Identifies a template by its first bytes ("magic numbers") rather than its extension or the
 * browser-reported type, both of which are trivially wrong or spoofed.
 */
export function sniffTemplateType(bytes: Uint8Array): TemplateMimeType | null {
  const starts = (sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (starts([0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf'; // "%PDF-"
  return null;
}

export const TemplateUploadRequestSchema = z.object({
  contentType: TemplateMimeTypeSchema,
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(TEMPLATE_MAX_BYTES, `Templates must be ${TEMPLATE_MAX_BYTES / 1024 / 1024} MB or smaller`),
});
export type TemplateUploadRequest = z.infer<typeof TemplateUploadRequestSchema>;

export const TemplateUploadResponseSchema = z.object({
  templateId: z.string(),
  uploadUrl: z.url(),
  /** Headers the browser must send with the PUT; they are part of the signature. */
  headers: z.record(z.string(), z.string()),
  expiresInSeconds: z.number().int(),
});
export type TemplateUploadResponse = z.infer<typeof TemplateUploadResponseSchema>;

export const TemplateSchema = z.object({
  id: z.string(),
  mimeType: TemplateMimeTypeSchema,
  widthPt: z.number().positive(),
  heightPt: z.number().positive(),
});
export type Template = z.infer<typeof TemplateSchema>;

export const TemplateCompleteResponseSchema = z.object({ template: TemplateSchema });
