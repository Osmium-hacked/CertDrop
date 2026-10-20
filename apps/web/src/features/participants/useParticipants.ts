import type { ValidationResult } from '@certdrop/shared';
import { useBatchDraft } from '../batch/draft';

/** Validated participant rows for the current draft, or null before a CSV is uploaded. */
export function useParticipantValidation(): ValidationResult | null {
  return useBatchDraft().validation;
}
