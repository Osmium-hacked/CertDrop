import { readFileSync } from 'node:fs';
import path from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { degrees, PDFDocument } from 'pdf-lib';

const FIXTURES = path.resolve(import.meta.dirname, '../fixtures');

/** 900×636 JPEG produced with System.Drawing (see test/fixtures). */
export const jpegFixture = (): Uint8Array =>
  new Uint8Array(readFileSync(path.join(FIXTURES, 'template-900x636.jpg')));

function pngChunk(type: string, data: Uint8Array): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function ihdr(width: number, height: number): Buffer {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data[8] = 8; // bit depth
  data[9] = 2; // colour type: RGB
  return pngChunk('IHDR', data);
}

/** A real, decodable solid-colour RGB PNG. */
export function makePng(width: number, height: number): Uint8Array {
  const row = Buffer.alloc(1 + width * 3, 0xee);
  row[0] = 0; // filter: none
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return new Uint8Array(
    Buffer.concat([
      PNG_SIGNATURE,
      ihdr(width, height),
      pngChunk('IDAT', deflateSync(raw)),
      pngChunk('IEND', Buffer.alloc(0)),
    ]),
  );
}

/** PNG header claiming the given size, with no pixel data: what a decompression bomb looks like up front. */
export function makePngHeaderOnly(width: number, height: number): Uint8Array {
  return new Uint8Array(
    Buffer.concat([PNG_SIGNATURE, ihdr(width, height), pngChunk('IEND', Buffer.alloc(0))]),
  );
}

export async function makePdf(
  pages: Array<[number, number]>,
  options: { rotate?: number } = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const size of pages) {
    const page = doc.addPage(size);
    if (options.rotate) page.setRotation(degrees(options.rotate));
  }
  return doc.save();
}

/** Inserts an EXIF APP1 segment with the given orientation right after the JPEG's SOI marker. */
export function withExifOrientation(jpeg: Uint8Array, orientation: number): Uint8Array {
  const tiff = Buffer.alloc(26);
  tiff.write('MM', 0, 'ascii'); // big-endian
  tiff.writeUInt16BE(0x002a, 2);
  tiff.writeUInt32BE(8, 4); // IFD0 offset
  tiff.writeUInt16BE(1, 8); // one entry
  tiff.writeUInt16BE(0x0112, 10); // Orientation
  tiff.writeUInt16BE(3, 12); // SHORT
  tiff.writeUInt32BE(1, 14); // count
  tiff.writeUInt16BE(orientation, 18);
  tiff.writeUInt32BE(0, 22); // no next IFD
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]);
  const header = Buffer.from([0xff, 0xe1, 0, 0]);
  header.writeUInt16BE(payload.length + 2, 2);
  return new Uint8Array(
    Buffer.concat([Buffer.from(jpeg.subarray(0, 2)), header, payload, Buffer.from(jpeg.subarray(2))]),
  );
}
