// String unions that mirror the Prisma enums, so the web app never imports @prisma/client.
// apps/api/test/enums.test.ts fails if the two drift apart.

export const CERTIFICATE_STATUSES = ['QUEUED', 'GENERATED', 'SENT', 'FAILED'] as const;
export type CertificateStatus = (typeof CERTIFICATE_STATUSES)[number];

export const BATCH_STATUSES = ['PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS'] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];

export const FAILED_STAGES = ['GENERATE', 'SEND'] as const;
export type FailedStage = (typeof FAILED_STAGES)[number];

export const DELIVERY_STATUSES = ['DELIVERED', 'BOUNCED', 'COMPLAINED'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];
