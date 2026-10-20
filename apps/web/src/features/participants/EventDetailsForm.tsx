import { EventDetailsSchema, fillPlaceholders, type EventDetails } from '@certdrop/shared';
import { useId, useMemo, useState } from 'react';
import { TextField } from '../../components/ui/TextField';
import { cn } from '../../lib/cn';
import { useBatchDraft } from '../batch/draft';
import { useParticipantValidation } from './useParticipants';

type Field = keyof EventDetails;

/** Event name, issuer, date and the email text, with a live preview for the first participant. */
export function EventDetailsForm() {
  const { event, updateEvent } = useBatchDraft();
  const validation = useParticipantValidation();
  // Errors appear once a field has been visited, not while the form is still empty.
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});

  const errors = useMemo(() => {
    const result = EventDetailsSchema.safeParse(event);
    const map: Partial<Record<Field, string>> = {};
    if (!result.success) {
      for (const issue of result.error.issues) {
        const key = issue.path[0] as Field;
        map[key] ??= issue.message;
      }
    }
    return map;
  }, [event]);

  const field = (name: Field) => ({
    value: event[name],
    onChange: (e: { target: { value: string } }) => updateEvent({ [name]: e.target.value }),
    onBlur: () => setTouched((t) => ({ ...t, [name]: true })),
    error: touched[name] ? errors[name] : undefined,
  });

  const first = validation?.valid[0];
  const values = {
    name: first?.name ?? 'Ana Lima',
    event: event.eventName.trim() || 'your event',
    issuer: event.issuerName.trim() || 'your organization',
  };

  return (
    <div className="grid gap-x-6 gap-y-5 lg:grid-cols-2">
      <div className="space-y-4">
        <TextField
          label="Event name"
          placeholder="Spring Hackathon 2026"
          maxLength={120}
          {...field('eventName')}
        />
        <TextField
          label="Issued by"
          placeholder="Your club, school or company"
          maxLength={100}
          hint="Shown on the verification page and as the email’s sender name."
          {...field('issuerName')}
        />
        <TextField label="Issue date" type="date" {...field('issueDate')} />
      </div>

      <div className="space-y-4">
        <TextField
          label="Email subject"
          maxLength={150}
          hint="You can use {name}, {event} and {issuer}."
          {...field('emailSubject')}
        />
        <TextArea label="Email message" rows={7} maxLength={2000} {...field('emailMessage')} />
        <div className="rounded-xl border border-line bg-canvas p-4">
          <p className="text-[11px] tracking-[0.08em] text-muted uppercase">
            Preview{first ? ` for ${first.name}` : ''}
          </p>
          <p className="mt-2 text-sm font-medium text-fg">{fillPlaceholders(event.emailSubject, values)}</p>
          <p className="mt-2 text-sm whitespace-pre-wrap text-muted">
            {fillPlaceholders(event.emailMessage, values)}
          </p>
          <p className="mt-3 border-t border-line pt-3 text-[13px] text-muted">
            + certificate PDF attached, and a link to verify it online
          </p>
        </div>
      </div>
    </div>
  );
}

function TextArea(props: {
  label: string;
  rows: number;
  maxLength: number;
  value: string;
  onChange: (e: { target: { value: string } }) => void;
  onBlur: () => void;
  error?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-fg">
        {props.label}
      </label>
      <textarea
        id={id}
        rows={props.rows}
        maxLength={props.maxLength}
        value={props.value}
        onChange={props.onChange}
        onBlur={props.onBlur}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={props.error ? `${id}-error` : undefined}
        className={cn(
          'w-full rounded-lg border bg-canvas px-3 py-2 text-sm text-fg',
          props.error ? 'border-danger/60' : 'border-line-strong hover:border-white/20',
        )}
      />
      {props.error && (
        <p id={`${id}-error`} className="mt-1.5 text-[13px] text-danger">
          {props.error}
        </p>
      )}
    </div>
  );
}
