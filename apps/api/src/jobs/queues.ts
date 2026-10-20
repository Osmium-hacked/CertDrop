import type { Db, PgBoss, Queue } from 'pg-boss';

/**
 * Two queues rather than one "process certificate" job: a failed email retries just the send,
 * without re-rendering the PDF, and each stage gets its own concurrency and retry policy.
 */
export const GENERATE_QUEUE = 'certificate-generate';
export const SEND_QUEUE = 'certificate-send';

export interface CertificateJob {
  certificateId: string;
}

type QueueConfig = Omit<Queue, 'name'> & { retryLimit: number };

export const QUEUE_CONFIG: Record<typeof GENERATE_QUEUE | typeof SEND_QUEUE, QueueConfig> = {
  // Rendering rarely fails transiently (a storage hiccup at most), so a few quick retries.
  [GENERATE_QUEUE]: { retryLimit: 3, retryDelay: 5, retryBackoff: true, expireInSeconds: 120 },
  // Email providers rate-limit and have brief outages: back off from 20s up to a few minutes.
  [SEND_QUEUE]: {
    retryLimit: 5,
    retryDelay: 20,
    retryBackoff: true,
    retryDelayMax: 600,
    expireInSeconds: 60,
  },
};

export async function ensureQueues(boss: PgBoss): Promise<void> {
  for (const [name, config] of Object.entries(QUEUE_CONFIG)) {
    if (!(await boss.getQueue(name))) await boss.createQueue(name, config);
  }
}

/**
 * What the API and the worker need from the job queue. Both methods accept a database handle so
 * jobs can be inserted inside the same Postgres transaction as the rows they refer to: either
 * both commit or neither does, so a batch can never be created without its jobs.
 */
export interface CertificateQueue {
  enqueueGenerate(certificateIds: string[], db?: Db): Promise<void>;
  enqueueSend(certificateIds: string[], db?: Db): Promise<void>;
}

export class PgBossCertificateQueue implements CertificateQueue {
  constructor(private readonly boss: PgBoss) {}

  enqueueGenerate(certificateIds: string[], db?: Db): Promise<void> {
    return this.insert(GENERATE_QUEUE, certificateIds, db);
  }

  enqueueSend(certificateIds: string[], db?: Db): Promise<void> {
    return this.insert(SEND_QUEUE, certificateIds, db);
  }

  private async insert(queue: string, certificateIds: string[], db?: Db): Promise<void> {
    if (certificateIds.length === 0) return;
    await this.boss.insert(
      queue,
      certificateIds.map((certificateId) => ({
        data: { certificateId } satisfies CertificateJob,
        // One live job per certificate and stage: a duplicate request can't double-send.
        singletonKey: certificateId,
      })),
      db ? { db } : undefined,
    );
  }
}
