import type { TemplateMimeType } from '@certdrop/shared';

/** Longest side of the editor's raster. Plenty for a crisp preview without huge memory use. */
const RASTER_LONG_SIDE_PX = 2000;

/**
 * Turns the chosen file into something the editor canvas can draw. Images decode natively; PDFs
 * are rendered with pdf.js, loaded on demand so organizers with PNG templates never download it.
 */
export async function rasterizeTemplate(
  file: File,
  type: TemplateMimeType,
): Promise<ImageBitmap | HTMLCanvasElement> {
  if (type !== 'application/pdf') return createImageBitmap(file);

  const [pdfjs, { default: workerUrl }] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: RASTER_LONG_SIDE_PX / Math.max(base.width, base.height) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvas, viewport }).promise;
    return canvas;
  } finally {
    // Frees the document and its worker-side resources.
    await task.destroy();
  }
}
