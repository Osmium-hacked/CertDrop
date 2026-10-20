import { IMAGE_TEMPLATE_LONG_SIDE_PT, sniffTemplateType, type TemplateMimeType } from '@certdrop/shared';
import { EncryptedPDFError, PDFDocument } from 'pdf-lib';

/** A template the organizer needs to fix. The message is shown to them as-is. */
export class TemplateRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateRejectedError';
  }
}

export interface TemplateInfo {
  widthPt: number;
  heightPt: number;
}

/** Below this the printed name and QR code look visibly blurry. */
const MIN_IMAGE_LONG_SIDE_PX = 600;
/**
 * Decompression-bomb guard: a 10 MB PNG can declare billions of pixels. Dimensions are read from
 * the header and checked *before* anything decodes the image. 40 MP covers a 300 dpi A3 poster.
 */
const MAX_IMAGE_PIXELS = 40_000_000;
const MAX_PDF_PAGE_PT = 14_400; // PDF's own page size limit (200 inches)

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Validates an uploaded template and returns its page size in points. Runs after the browser's
 * direct upload, because the API never sees the bytes during the upload itself.
 */
export async function inspectTemplate(bytes: Uint8Array, declared: TemplateMimeType): Promise<TemplateInfo> {
  const actual = sniffTemplateType(bytes);
  if (!actual) throw new TemplateRejectedError('This file isn’t a PNG, JPG or PDF.');
  if (actual !== declared) {
    throw new TemplateRejectedError('The file’s contents don’t match its type. Re-export it and try again.');
  }

  switch (actual) {
    case 'image/png':
      return inspectImage(readPngSize(bytes), async () => {
        await (await PDFDocument.create()).embedPng(bytes);
      });
    case 'image/jpeg': {
      const jpeg = readJpegInfo(bytes);
      if (jpeg.orientation !== 1) {
        // pdf-lib ignores EXIF rotation while browsers apply it, so the preview and the
        // certificate would disagree. Phone photos are the usual source.
        throw new TemplateRejectedError(
          'This JPG relies on EXIF rotation. Rotate it in an image editor (or export as PNG) and upload again.',
        );
      }
      return inspectImage(jpeg, async () => {
        await (await PDFDocument.create()).embedJpg(bytes);
      });
    }
    case 'application/pdf':
      return inspectPdf(bytes);
  }
}

async function inspectImage(
  size: { width: number; height: number },
  decode: () => Promise<void>,
): Promise<TemplateInfo> {
  const { width, height } = size;
  if (width * height > MAX_IMAGE_PIXELS) {
    throw new TemplateRejectedError(
      `The image is ${width}×${height}px. Please export it at 40 megapixels or less.`,
    );
  }
  if (Math.max(width, height) < MIN_IMAGE_LONG_SIDE_PX) {
    throw new TemplateRejectedError(
      `The image is only ${width}×${height}px. Export at least ${MIN_IMAGE_LONG_SIDE_PX}px on the longer side so it prints sharply.`,
    );
  }
  try {
    await decode();
  } catch {
    throw new TemplateRejectedError('The image appears to be damaged. Re-export it and try again.');
  }
  const scale = IMAGE_TEMPLATE_LONG_SIDE_PT / Math.max(width, height);
  return { widthPt: round2(width * scale), heightPt: round2(height * scale) };
}

async function inspectPdf(bytes: Uint8Array): Promise<TemplateInfo> {
  try {
    return await readPdfPage(bytes);
  } catch (err) {
    if (err instanceof TemplateRejectedError) throw err;
    if (err instanceof EncryptedPDFError) {
      throw new TemplateRejectedError('This PDF is password-protected. Export it without protection.');
    }
    // pdf-lib parses leniently and can fail later, anywhere in the page tree, on malformed files.
    throw new TemplateRejectedError('This PDF couldn’t be read. Re-export it and try again.');
  }
}

async function readPdfPage(bytes: Uint8Array): Promise<TemplateInfo> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const pageCount = doc.getPageCount();
  if (pageCount !== 1) {
    throw new TemplateRejectedError(`The PDF has ${pageCount} pages. Upload a single-page certificate.`);
  }
  const page = doc.getPage(0);
  if (page.getRotation().angle % 360 !== 0) {
    throw new TemplateRejectedError(
      'This PDF page is rotated. Export it in its final orientation and try again.',
    );
  }
  // The crop box is the visible area (what viewers and pdf.js show); it defaults to the media box.
  const { width, height } = page.getCropBox();
  if (width <= 0 || height <= 0 || width > MAX_PDF_PAGE_PT || height > MAX_PDF_PAGE_PT) {
    throw new TemplateRejectedError('The PDF page size isn’t supported.');
  }
  return { widthPt: round2(width), heightPt: round2(height) };
}

/** Width and height from the PNG IHDR chunk, which the format requires to come first. */
export function readPngSize(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const isIhdr = bytes.length >= 24 && String.fromCharCode(...bytes.subarray(12, 16)) === 'IHDR';
  if (!isIhdr)
    throw new TemplateRejectedError('The image appears to be damaged. Re-export it and try again.');
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

const SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

/**
 * Walks JPEG segments up to the frame header (SOFn) for the pixel size, picking up the EXIF
 * orientation (tag 0x0112 in IFD0 of the APP1 "Exif" segment) on the way.
 */
export function readJpegInfo(bytes: Uint8Array): { width: number; height: number; orientation: number } {
  const damaged = () =>
    new TemplateRejectedError('The image appears to be damaged. Re-export it and try again.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let orientation = 1;
  let i = 2; // after SOI (FF D8)

  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) throw damaged();
    const marker = bytes[i + 1]!;
    if (marker === 0xff) {
      i += 1; // fill byte
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      i += 2; // standalone markers carry no length
      continue;
    }
    const length = view.getUint16(i + 2);
    const data = i + 4;
    if (length < 2 || data + length - 2 > bytes.length) throw damaged();

    if (marker === 0xe1 && String.fromCharCode(...bytes.subarray(data, data + 4)) === 'Exif') {
      orientation = readExifOrientation(view, data + 6, data + length - 2) ?? orientation;
    }
    if (SOF_MARKERS.has(marker)) {
      return { height: view.getUint16(data + 1), width: view.getUint16(data + 3), orientation };
    }
    if (marker === 0xda) break; // start of scan without a frame header
    i = data + length - 2;
  }
  throw damaged();
}

function readExifOrientation(view: DataView, tiff: number, end: number): number | null {
  if (tiff + 8 > end) return null;
  const order = view.getUint16(tiff);
  if (order !== 0x4949 && order !== 0x4d4d) return null; // "II" little-endian / "MM" big-endian
  const le = order === 0x4949;
  const ifd = tiff + view.getUint32(tiff + 4, le);
  if (ifd + 2 > end) return null;
  const entries = view.getUint16(ifd, le);
  for (let n = 0; n < entries; n++) {
    const entry = ifd + 2 + n * 12;
    if (entry + 12 > end) return null;
    if (view.getUint16(entry, le) === 0x0112) return view.getUint16(entry + 8, le);
  }
  return null;
}
