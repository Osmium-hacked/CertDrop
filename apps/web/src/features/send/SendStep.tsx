import { useBatchDraft } from '../batch/draft';
import { BatchProgress } from './BatchProgress';
import { ConfirmSend } from './ConfirmSend';

/** Step 4: confirm, then follow the batch as the worker generates and sends each certificate. */
export default function SendStep({ onStartOver }: { onStartOver: () => void }) {
  const { batchId } = useBatchDraft();
  return batchId ? <BatchProgress batchId={batchId} onStartOver={onStartOver} /> : <ConfirmSend />;
}
