import type { FontMetrics } from './fit';
import type { CertFont } from './layout';

export interface CertFontMeta {
  id: CertFont;
  label: string;
  category: 'serif' | 'script' | 'sans';
  /** TTF file in packages/shared/fonts, used by both the browser preview and the PDF renderer. */
  file: string;
  /**
   * Vertical metrics (hhea ascender/descender ÷ unitsPerEm), read from the file once and stored
   * here so the preview and the PDF place the baseline identically; browsers may otherwise pick
   * different metric tables. apps/api/test/unit/fonts.test.ts checks them against the files.
   */
  metrics: FontMetrics;
}

/**
 * Certificate fonts, all SIL Open Font License (licenses in packages/shared/fonts/licenses).
 * Static TTF instances rather than variable fonts: pdf-lib embeds and subsets static fonts reliably.
 */
export const CERT_FONT_META: Record<CertFont, CertFontMeta> = {
  'playfair-display': {
    id: 'playfair-display',
    label: 'Playfair Display',
    category: 'serif',
    file: 'PlayfairDisplay-SemiBold.ttf',
    metrics: { ascent: 1.082, descent: -0.251 },
  },
  'eb-garamond': {
    id: 'eb-garamond',
    label: 'EB Garamond',
    category: 'serif',
    file: 'EBGaramond-Medium.ttf',
    metrics: { ascent: 1.007, descent: -0.298 },
  },
  'great-vibes': {
    id: 'great-vibes',
    label: 'Great Vibes',
    category: 'script',
    file: 'GreatVibes-Regular.ttf',
    metrics: { ascent: 0.851, descent: -0.401 },
  },
  inter: {
    id: 'inter',
    label: 'Inter',
    category: 'sans',
    file: 'Inter-SemiBold.ttf',
    metrics: { ascent: 0.969, descent: -0.241 },
  },
  montserrat: {
    id: 'montserrat',
    label: 'Montserrat',
    category: 'sans',
    file: 'Montserrat-SemiBold.ttf',
    metrics: { ascent: 0.968, descent: -0.251 },
  },
};

/**
 * Drawn character by character wherever the chosen font lacks a glyph (e.g. Greek in Playfair
 * Display), so supported names never render as empty boxes. Lines keep the primary font's metrics.
 */
export const FALLBACK_FONT_FILE = 'NotoSans-SemiBold.ttf';
