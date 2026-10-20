import { IMAGE_TEMPLATE_LONG_SIDE_PT } from '@certdrop/shared';
import { describe, expect, it } from 'vitest';
import { inspectTemplate, readJpegInfo } from '../../src/modules/templates/inspect';
import { jpegFixture, makePdf, makePng, makePngHeaderOnly, withExifOrientation } from '../helpers/files';

describe('inspectTemplate: PNG', () => {
  it('scales the image onto an A4-length page, keeping its aspect ratio', async () => {
    const info = await inspectTemplate(makePng(2000, 1000), 'image/png');
    expect(info).toEqual({ widthPt: IMAGE_TEMPLATE_LONG_SIDE_PT, heightPt: IMAGE_TEMPLATE_LONG_SIDE_PT / 2 });
  });

  it('rejects images too small to print sharply', async () => {
    await expect(inspectTemplate(makePng(400, 300), 'image/png')).rejects.toThrow(/at least 600px/);
  });

  it('rejects oversized images from the header alone, without decoding them', async () => {
    // 30000×30000 = 900 MP. The file has no pixel data, so decoding would fail with "damaged";
    // getting the megapixel message proves the check runs first.
    await expect(inspectTemplate(makePngHeaderOnly(30_000, 30_000), 'image/png')).rejects.toThrow(
      /megapixels/,
    );
  });

  it('rejects a PNG whose pixel data is damaged', async () => {
    await expect(inspectTemplate(makePngHeaderOnly(1200, 800), 'image/png')).rejects.toThrow(/damaged/);
  });
});

describe('inspectTemplate: JPEG', () => {
  it('reads the frame size', async () => {
    expect(readJpegInfo(jpegFixture())).toMatchObject({ width: 900, height: 636, orientation: 1 });
    const info = await inspectTemplate(jpegFixture(), 'image/jpeg');
    expect(info.widthPt).toBe(IMAGE_TEMPLATE_LONG_SIDE_PT);
    expect(info.heightPt).toBeCloseTo((636 / 900) * IMAGE_TEMPLATE_LONG_SIDE_PT, 1);
  });

  it('accepts an explicit "normal" EXIF orientation', async () => {
    await expect(inspectTemplate(withExifOrientation(jpegFixture(), 1), 'image/jpeg')).resolves.toBeDefined();
  });

  it('rejects photos that rely on EXIF rotation', async () => {
    const rotated = withExifOrientation(jpegFixture(), 6);
    expect(readJpegInfo(rotated).orientation).toBe(6);
    await expect(inspectTemplate(rotated, 'image/jpeg')).rejects.toThrow(/EXIF rotation/);
  });

  it('rejects a truncated file', async () => {
    await expect(inspectTemplate(jpegFixture().subarray(0, 40), 'image/jpeg')).rejects.toThrow(/damaged/);
  });
});

describe('inspectTemplate: PDF', () => {
  it('uses the page size of a single-page PDF', async () => {
    await expect(inspectTemplate(await makePdf([[842, 595]]), 'application/pdf')).resolves.toEqual({
      widthPt: 842,
      heightPt: 595,
    });
  });

  it('rejects multi-page PDFs', async () => {
    const pdf = await makePdf([
      [842, 595],
      [842, 595],
    ]);
    await expect(inspectTemplate(pdf, 'application/pdf')).rejects.toThrow(/2 pages/);
  });

  it('rejects rotated pages', async () => {
    await expect(
      inspectTemplate(await makePdf([[595, 842]], { rotate: 90 }), 'application/pdf'),
    ).rejects.toThrow(/rotated/);
  });

  it('rejects something that only starts like a PDF', async () => {
    const fake = new TextEncoder().encode('%PDF-1.7\nnot really a pdf');
    await expect(inspectTemplate(fake, 'application/pdf')).rejects.toThrow(/couldn’t be read/);
  });
});

describe('inspectTemplate: type checks', () => {
  it('rejects content that does not match the declared type', async () => {
    await expect(inspectTemplate(await makePdf([[842, 595]]), 'image/png')).rejects.toThrow(/don’t match/);
  });

  it('rejects unsupported formats such as SVG', async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    await expect(inspectTemplate(svg, 'image/png')).rejects.toThrow(/isn’t a PNG, JPG or PDF/);
  });
});
