import type { Layout, Template } from '@certdrop/shared';
import { createContext, useContext } from 'react';

/** A verified template plus the raster the editor draws (decoded image or rendered PDF page). */
export interface LoadedTemplate extends Template {
  fileName: string;
  raster: ImageBitmap | HTMLCanvasElement;
}

/** Sensible starting point: a wide box across the middle of the page, no QR code. */
export const DEFAULT_LAYOUT: Layout = {
  nameBox: { x: 0.15, y: 0.42, width: 0.7, height: 0.13 },
  font: 'playfair-display',
  fontSize: 44,
  color: '#1f2433',
  align: 'center',
  qrBox: null,
};

export interface BatchDraft {
  template: LoadedTemplate | null;
  layout: Layout;
  setTemplate: (template: LoadedTemplate | null) => void;
  updateLayout: (patch: Partial<Layout>) => void;
}

export const BatchDraftContext = createContext<BatchDraft | null>(null);

export function useBatchDraft(): BatchDraft {
  const draft = useContext(BatchDraftContext);
  if (!draft) throw new Error('useBatchDraft must be used inside <BatchDraftProvider>');
  return draft;
}
