import { CERT_FONTS, splitFontRuns, type CertFont, type FontRun, type MeasureText } from '@certdrop/shared';
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

/**
 * CSS font for one run of text. Fallback is decided per word by the shared coverage table (the
 * same rule the PDF renderer applies), not left to the browser's per-character fallback.
 */
export const runFont = (font: CertFont, run: FontRun, sizePx: number) =>
  `${sizePx}px "${run.fallback ? FALLBACK_FAMILY : fontFamily(font)}"`;

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
    return splitFontRuns(text, font).reduce((width, run) => {
      measureContext.font = runFont(font, run, 100);
      return width + measureContext.measureText(run.text).width / 100;
    }, 0);
  };
}
