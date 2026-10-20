import { BATCH_STATUSES, CERTIFICATE_STATUSES, DELIVERY_STATUSES, FAILED_STAGES } from '@certdrop/shared';
import { BatchStatus, CertificateStatus, DeliveryStatus, FailedStage } from '@prisma/client';
import { describe, expect, it } from 'vitest';

// The web app uses the string unions from @certdrop/shared; the database uses Prisma enums.
// This keeps the two definitions from silently drifting apart.
describe('shared enums match the Prisma schema', () => {
  it.each([
    ['CertificateStatus', CertificateStatus, CERTIFICATE_STATUSES],
    ['BatchStatus', BatchStatus, BATCH_STATUSES],
    ['FailedStage', FailedStage, FAILED_STAGES],
    ['DeliveryStatus', DeliveryStatus, DELIVERY_STATUSES],
  ])('%s', (_name, prismaEnum, shared) => {
    expect(Object.values(prismaEnum)).toEqual([...shared]);
  });
});
