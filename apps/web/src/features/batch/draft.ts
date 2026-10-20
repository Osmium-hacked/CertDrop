import {
  DEFAULT_EMAIL_MESSAGE,
  DEFAULT_EMAIL_SUBJECT,
  type ColumnMapping,
  type EventDetails,
  type Layout,
  type RowOverride,
  type Template,
  type ValidationResult,
} from '@certdrop/shared';
import { createContext, useContext } from 'react';

/** A verified template plus the raster the editor draws (decoded image or rendered PDF page). */
export interface LoadedTemplate extends Template {
  fileName: string;
  raster: ImageBitmap | HTMLCanvasElement;
}

/** Sensible starting point: a wide box across the middle of the page, no QR code. */
export const DEFAULT_LAYOUT: Layout = {
  nameBox: { x: 0.15, y: 0.42, width: 0.7, height: 0.13 },
  font: 'playfair-display',
  fontSize: 44,
  color: '#1f2433',
  align: 'center',
  qrBox: null,
};

/** The uploaded CSV as parsed in the browser, plus the organizer's mapping and fixes. */
export interface ParticipantsDraft {
  fileName: string;
  headers: string[];
  rows: Array<Record<string, string>>;
  mapping: ColumnMapping;
  /** Inline corrections, keyed by row index. Kept separate so the original data is untouched. */
  overrides: Record<number, RowOverride>;
  /** Send to the valid rows only and leave the flagged ones out. */
  skipInvalid: boolean;
}

/** Today in the organizer's time zone, as YYYY-MM-DD for <input type="date">. */
function today(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export function defaultEventDetails(): EventDetails {
  return {
    eventName: '',
    issuerName: '',
    issueDate: today(),
    emailSubject: DEFAULT_EMAIL_SUBJECT,
    emailMessage: DEFAULT_EMAIL_MESSAGE,
  };
}

export interface BatchDraft {
  template: LoadedTemplate | null;
  layout: Layout;
  participants: ParticipantsDraft | null;
  /** Validated rows, computed once per change and shared by every component that needs them. */
  validation: ValidationResult | null;
  event: EventDetails;
  setTemplate: (template: LoadedTemplate | null) => void;
  updateLayout: (patch: Partial<Layout>) => void;
  setParticipants: (participants: ParticipantsDraft | null) => void;
  updateParticipants: (patch: Partial<ParticipantsDraft>) => void;
  updateEvent: (patch: Partial<EventDetails>) => void;
}

export const BatchDraftContext = createContext<BatchDraft | null>(null);

export function useBatchDraft(): BatchDraft {
  const draft = useContext(BatchDraftContext);
  if (!draft) throw new Error('useBatchDraft must be used inside <BatchDraftProvider>');
  return draft;
}
