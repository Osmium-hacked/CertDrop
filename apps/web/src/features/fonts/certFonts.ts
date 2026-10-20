import { CERT_FONTS, type CertFont, type MeasureText } from '@certdrop/shared';
import ebGaramond from '@certdrop/shared/fonts/EBGaramond-Medium.ttf?url';
import greatVibes from '@certdrop/shared/fonts/GreatVibes-Regular.ttf?url';
import inter from '@certdrop/shared/fonts/Inter-SemiBold.ttf?url';
import montserrat from '@certdrop/shared/fonts/Montserrat-SemiBold.ttf?url';
import notoSans from '@certdrop/shared/fonts/NotoSans-SemiBold.ttf?url';
import playfair from '@certdrop/shared/fonts/PlayfairDisplay-SemiBold.ttf?url';
import { useEffect, useState } from 'react';

// The preview loads the exact TTF files the PDF renderer embeds, under private family names, so
// text measures the same in the browser as on the server.
const FONT_URLS: Record<CertFont, string> = {
  'playfair-display': playfair,
  'eb-garamond': ebGaramond,
  'great-vibes': greatVibes,
  inter,
  montserrat,
};
const FALLBACK_FAMILY = 'cd-fallback';

export const fontFamily = (font: CertFont) => `cd-${font}`;

/** CSS font shorthand with the shared fallback font, mirroring the server's per-glyph fallback. */
export const cssFont = (font: CertFont, sizePx: number) =>
  `${sizePx}px "${fontFamily(font)}", "${FALLBACK_FAMILY}"`;

let loading: Promise<void> | null = null;

export function loadCertFonts(): Promise<void> {
  loading ??= Promise.all(
    [
      ...CERT_FONTS.map((font) => new FontFace(fontFamily(font), `url(${FONT_URLS[font]})`)),
      new FontFace(FALLBACK_FAMILY, `url(${notoSans})`),
    ].map(async (face) => document.fonts.add(await face.load())),
  ).then(() => undefined);
  return loading;
}

/** True once every certificate font is ready to draw and measure. */
export function useCertFontsReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    void loadCertFonts().then(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);
  return ready;
}

const measureContext = document.createElement('canvas').getContext('2d');

/** Width at font size 1, for the shared fit algorithm. Measured at 100px for precision. */
export function measureWith(font: CertFont): MeasureText {
  return (text) => {
    if (!measureContext) return text.length * 0.5;
    measureContext.font = cssFont(font, 100);
    return measureContext.measureText(text).width / 100;
  };
}
