import { EventDetailsSchema } from '@certdrop/shared';
import { useSession } from '../auth/session';
import { useBatchDraft } from '../batch/draft';
import { useParticipantValidation } from '../participants/useParticipants';
import type { StepDefinition } from './steps';

export interface StepStatus {
  complete: boolean;
  /** Shown next to a disabled Continue button so it's clear what's missing. */
  hint: string | null;
}

/** Whether each wizard step is done, and if not, what the organizer still needs to do. */
export function useStepStatus(): Record<StepDefinition['id'], StepStatus> {
  const session = useSession();
  const { template, participants, event } = useBatchDraft();
  const validation = useParticipantValidation();

  const signedIn = Boolean(session.data?.organizer);
  const invalid = validation?.invalid.length ?? 0;
  const valid = validation?.valid.length ?? 0;

  const participantsHint = !participants
    ? 'Upload your participant CSV to continue'
    : valid === 0
      ? 'No rows are ready yet'
      : invalid > 0 && !participants.skipInvalid
        ? `Fix or skip ${invalid === 1 ? 'the row' : `${invalid} rows`} that need fixing`
        : !EventDetailsSchema.safeParse(event).success
          ? 'Complete the event details to continue'
          : null;

  return {
    verify: { complete: signedIn, hint: signedIn ? null : 'Verify your email to continue' },
    template: { complete: template !== null, hint: template ? null : 'Upload a template to continue' },
    participants: { complete: participantsHint === null, hint: participantsHint },
    send: { complete: false, hint: null },
  };
}
