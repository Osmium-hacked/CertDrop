import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import type { Env } from '../config/env';

/**
 * Object storage behind a small interface. The S3 implementation works with Cloudflare R2,
 * RustFS (local docker-compose) and AWS; tests pass an in-memory fake. Upload, download and
 * signed-URL methods are added as the features that need them land.
 */
export interface Storage {
  /** Resolves if the bucket is reachable with the configured credentials. */
  ping(): Promise<void>;
}

export class S3Storage implements Storage {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  async ping(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
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
      if (!(err instanceof S3ServiceException) || err.$metadata.httpStatusCode !== 404) throw err;
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
              AllowedHeaders: ['content-type', 'content-length'],
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
  });
  return new S3Storage(client, env.S3_BUCKET);
}
