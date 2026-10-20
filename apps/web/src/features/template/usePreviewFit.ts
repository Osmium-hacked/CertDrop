import {
  CERT_FONT_META,
  findUnsupportedCharacters,
  fitName,
  minFontSize,
  positionLines,
  type FitResult,
  type Layout,
  type PositionedLine,
  type Template,
} from '@certdrop/shared';
import { useMemo } from 'react';
import { measureWith } from '../fonts/certFonts';

export interface PreviewFit {
  fit: FitResult;
  /** Line positions in page points, relative to the name box's top-left corner. */
  lines: PositionedLine[];
  unsupported: string[];
  minSize: number;
}

/**
 * Runs the same fit and layout code the PDF renderer runs, so what the editor shows is what
 * recipients get. `fontsReady` forces a re-measure once the real fonts have loaded.
 */
export function usePreviewFit(
  name: string,
  layout: Layout,
  template: Template,
  fontsReady: boolean,
): PreviewFit {
  return useMemo(() => {
    const measure = measureWith(layout.font);
    const box = {
      width: layout.nameBox.width * template.widthPt,
      height: layout.nameBox.height * template.heightPt,
    };
    const fit = fitName(name, box, layout.fontSize, measure);
    return {
      fit,
      lines: positionLines(fit, box, layout.align, measure, CERT_FONT_META[layout.font].metrics),
      unsupported: findUnsupportedCharacters(name),
      minSize: minFontSize(layout.fontSize),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fontsReady invalidates cached measurements
  }, [name, layout, template.widthPt, template.heightPt, fontsReady]);
}
