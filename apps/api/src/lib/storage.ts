import {
  CreateBucketCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'node:stream';
import type { Env } from '../config/env';

export interface ObjectInfo {
  sizeBytes: number;
  contentType: string | undefined;
}

/**
 * Object storage behind a small interface. The S3 implementation works with Cloudflare R2,
 * RustFS (local docker-compose) and AWS; tests can pass an in-memory fake.
 *
 * Objects are private. Browsers only ever get short-lived presigned URLs, never a public
 * bucket URL.
 */
export interface Storage {
  /** Resolves if the bucket is reachable with the configured credentials. */
  ping(): Promise<void>;
  /**
   * URL the browser can PUT one file to. Content type and exact length are part of the
   * signature, so the upload is rejected if either differs from what the API approved.
   */
  presignPut(
    key: string,
    contentType: string,
    contentLength: number,
    expiresInSeconds: number,
  ): Promise<string>;
  head(key: string): Promise<ObjectInfo | null>;
  getBytes(key: string): Promise<Uint8Array>;
  /** Streams an object, e.g. into a ZIP, without holding it all in memory. */
  getStream(key: string): Promise<Readable>;
  putBytes(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /**
   * Short-lived download URL. `downloadName` sets Content-Disposition so the browser saves the
   * file under a readable name instead of the storage key.
   */
  presignGet(key: string, expiresInSeconds: number, downloadName?: string): Promise<string>;
  delete(key: string): Promise<void>;
  /** Deletes many objects in as few requests as possible (S3 allows 1,000 keys per call). */
  deleteMany(keys: string[]): Promise<void>;
}

/**
 * RFC 6266 attachment header: an ASCII fallback name plus the UTF-8 original, so "Zoë.pdf"
 * downloads correctly everywhere.
 */
export function contentDisposition(fileName: string): string {
  const ascii =
    fileName
      .normalize('NFKD')
      .replace(/[^\x20-\x7e]/g, '')
      .replace(/["\\]/g, '') || 'download';
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

const isNotFound = (err: unknown) =>
  err instanceof S3ServiceException && (err.$metadata.httpStatusCode === 404 || err.name === 'NotFound');

export class S3Storage implements Storage {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  async ping(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }

  presignPut(
    key: string,
    contentType: string,
    contentLength: number,
    expiresInSeconds: number,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: contentLength,
    });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async head(key: string): Promise<ObjectInfo | null> {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { sizeBytes: res.ContentLength ?? 0, contentType: res.ContentType };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async getBytes(key: string): Promise<Uint8Array> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!res.Body) throw new Error(`Empty body for ${key}`);
    return res.Body.transformToByteArray();
  }

  async getStream(key: string): Promise<Readable> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    // In Node the SDK's body is an http.IncomingMessage, which is a Readable.
    if (!(res.Body instanceof Readable)) throw new Error(`Unexpected body type for ${key}`);
    return res.Body;
  }

  async putBytes(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: bytes, ContentType: contentType }),
    );
  }

  presignGet(key: string, expiresInSeconds: number, downloadName?: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ...(downloadName && { ResponseContentDisposition: contentDisposition(downloadName) }),
    });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async deleteMany(keys: string[]): Promise<void> {
    for (let i = 0; i < keys.length; i += 1000) {
      const chunk = keys.slice(i, i + 1000);
      const res = await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
        }),
      );
      // Missing keys aren't errors for S3; anything reported here is a real failure.
      if (res.Errors?.length)
        throw new Error(`Failed to delete ${res.Errors.length} objects: ${res.Errors[0]?.Message}`);
    }
  }

  /**
   * Creates the bucket if it is missing and sets its CORS rules. Idempotent; run by
   * `pnpm storage:init` locally and once per environment in production. CORS is needed because
   * browsers upload templates straight to storage with presigned PUT URLs.
   */
  async ensureBucket(corsOrigins: string[]): Promise<{ created: boolean }> {
    let created = false;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (err) {
      if (!isNotFound(err)) throw err;
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      created = true;
    }

    await this.client.send(
      new PutBucketCorsCommand({
        Bucket: this.bucket,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedOrigins: corsOrigins,
              AllowedMethods: ['PUT'],
              AllowedHeaders: ['content-type'],
              MaxAgeSeconds: 3600,
            },
          ],
        },
      }),
    );
    return { created };
  }
}

export function createS3Storage(env: Env): S3Storage {
  const client = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
    // The SDK's default "flexible checksums" add checksum parameters that S3-compatible stores
    // (R2, RustFS) don't all accept, and that a browser PUT to a presigned URL can't satisfy.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  return new S3Storage(client, env.S3_BUCKET);
}
