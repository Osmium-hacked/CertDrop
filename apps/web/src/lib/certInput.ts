/**
 * Accepts what people actually paste: an ID with stray spaces, a lowercase prefix, or the
 * whole verify URL from an email or QR scan. The random part is case-sensitive, so only the
 * prefix is normalized.
 */
export function normalizeCertInput(input: string): string {
  const trimmed = input.trim();
  const fromUrl = /\/verify\/([^/?#\s]+)/i.exec(trimmed)?.[1];
  const id = decodeURIComponent(fromUrl ?? trimmed).replace(/\s+/g, '');
  return id.replace(/^cd-/i, 'CD-');
}
