import { z } from 'zod';

/**
 * Certificate fonts. The TTF files live in packages/shared/fonts so the browser preview and the
 * server-side PDF renderer measure text with exactly the same glyph metrics.
 */
export const CERT_FONTS = ['playfair-display', 'eb-garamond', 'great-vibes', 'inter', 'montserrat'] as const;
export const CertFontSchema = z.enum(CERT_FONTS);
export type CertFont = z.infer<typeof CertFontSchema>;

const unit = z.number().min(0).max(1);

/**
 * A rectangle in normalized page coordinates: 0..1 of the page width/height, origin top-left.
 * Normalized units keep the layout independent of the editor's zoom level and of the template's
 * pixel size; the PDF renderer converts to points (and flips the y-axis) at draw time.
 */
export const BoxSchema = z
  .object({
    x: unit,
    y: unit,
    width: unit.positive(),
    height: unit.positive(),
  })
  .refine((b) => b.x + b.width <= 1.0001 && b.y + b.height <= 1.0001, {
    message: 'Box must lie inside the page',
  });
export type Box = z.infer<typeof BoxSchema>;

export const TextAlignSchema = z.enum(['left', 'center', 'right']);
export type TextAlign = z.infer<typeof TextAlignSchema>;

export const LayoutSchema = z.object({
  nameBox: BoxSchema,
  font: CertFontSchema,
  /** Preferred size in PDF points; the auto-fit shrinks it when a name is too wide. */
  fontSize: z.number().min(8).max(200),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a #rrggbb colour'),
  align: TextAlignSchema,
  qrBox: BoxSchema.nullable(),
});
export type Layout = z.infer<typeof LayoutSchema>;
