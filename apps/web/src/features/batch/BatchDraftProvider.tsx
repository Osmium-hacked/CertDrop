import { validateRows, type EventDetails, type Layout } from '@certdrop/shared';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  BatchDraftContext,
  DEFAULT_LAYOUT,
  defaultEventDetails,
  type LoadedTemplate,
  type ParticipantsDraft,
} from './draft';

/**
 * Everything the organizer has set up so far, shared by the wizard steps. It lives in memory
 * only: the template raster can't be serialized, and nothing is stored server-side until the
 * batch is created.
 */
export function BatchDraftProvider({ children }: { children: ReactNode }) {
  const [template, setTemplateState] = useState<LoadedTemplate | null>(null);
  const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT);
  const [participants, setParticipants] = useState<ParticipantsDraft | null>(null);
  const [event, setEvent] = useState<EventDetails>(defaultEventDetails);

  const setTemplate = useCallback((next: LoadedTemplate | null) => {
    setTemplateState((previous) => {
      if (previous?.raster instanceof ImageBitmap) previous.raster.close();
      return next;
    });
    // A new design starts from the default layout; positions from another design rarely fit.
    setLayout(DEFAULT_LAYOUT);
  }, []);

  const updateLayout = useCallback(
    (patch: Partial<Layout>) => setLayout((current) => ({ ...current, ...patch })),
    [],
  );
  const updateParticipants = useCallback(
    (patch: Partial<ParticipantsDraft>) =>
      setParticipants((current) => (current ? { ...current, ...patch } : current)),
    [],
  );
  const updateEvent = useCallback(
    (patch: Partial<EventDetails>) => setEvent((current) => ({ ...current, ...patch })),
    [],
  );

  const validation = useMemo(
    () =>
      participants ? validateRows(participants.rows, participants.mapping, participants.overrides) : null,
    [participants],
  );

  const value = useMemo(
    () => ({
      template,
      layout,
      participants,
      validation,
      event,
      setTemplate,
      updateLayout,
      setParticipants,
      updateParticipants,
      updateEvent,
    }),
    [
      template,
      layout,
      participants,
      validation,
      event,
      setTemplate,
      updateLayout,
      updateParticipants,
      updateEvent,
    ],
  );
  return <BatchDraftContext.Provider value={value}>{children}</BatchDraftContext.Provider>;
}
