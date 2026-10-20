import type { ColumnMapping } from '@certdrop/shared';
import { useRef } from 'react';
import { Button } from '../../components/ui/Button';
import { useBatchDraft } from '../batch/draft';
import { ParticipantTable } from './ParticipantTable';
import { useParticipantValidation } from './useParticipants';

const NOT_MAPPED = '';

/** Column mapping, validation summary and the row table for an uploaded CSV. */
export function ParticipantsReview({ onReplace }: { onReplace: (file: File) => void }) {
  const { participants, updateParticipants } = useBatchDraft();
  const validation = useParticipantValidation();
  const replaceRef = useRef<HTMLInputElement>(null);
  if (!participants || !validation) return null;

  const { mapping, headers } = participants;
  const setColumn = (key: keyof ColumnMapping, column: string) =>
    // Remapping changes every row, so earlier inline fixes no longer apply.
    updateParticipants({ mapping: { ...mapping, [key]: column || null }, overrides: {} });

  const validCount = validation.valid.length;
  const invalidCount = validation.invalid.length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-[13px] text-muted">
          <span className="text-fg">{participants.fileName}</span> ·{' '}
          {participants.rows.length.toLocaleString()} {participants.rows.length === 1 ? 'row' : 'rows'}
        </p>
        <Button variant="ghost" size="sm" onClick={() => replaceRef.current?.click()}>
          Replace
        </Button>
        <input
          ref={replaceRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) onReplace(file);
          }}
        />
      </div>

      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="sr-only">Column mapping</legend>
        <ColumnSelect
          label="Name column"
          value={mapping.name}
          headers={headers}
          onChange={(c) => setColumn('name', c)}
        />
        <ColumnSelect
          label="Last name column"
          optional
          value={mapping.lastName}
          headers={headers}
          onChange={(c) => setColumn('lastName', c)}
        />
        <ColumnSelect
          label="Email column"
          value={mapping.email}
          headers={headers}
          onChange={(c) => setColumn('email', c)}
        />
      </fieldset>
      {(!mapping.name || !mapping.email) && (
        <p className="rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-[13px] text-warn">
          We couldn’t find{' '}
          {!mapping.name && !mapping.email
            ? 'the name and email columns'
            : !mapping.name
              ? 'a name column'
              : 'an email column'}
          . Choose {!mapping.name && !mapping.email ? 'them' : 'it'} above.
        </p>
      )}

      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-elevated/60 px-4 py-3"
        aria-live="polite"
      >
        <span className="flex items-center gap-2 text-sm">
          <span aria-hidden className="size-2 rounded-full bg-ok" />
          <span className="font-medium text-fg tabular-nums">{validCount.toLocaleString()}</span>
          <span className="text-muted">ready</span>
        </span>
        <span className="flex items-center gap-2 text-sm">
          <span aria-hidden className={`size-2 rounded-full ${invalidCount ? 'bg-danger' : 'bg-white/20'}`} />
          <span className="font-medium text-fg tabular-nums">{invalidCount.toLocaleString()}</span>
          <span className="text-muted">need fixing</span>
        </span>
        {invalidCount > 0 && (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted sm:ml-auto">
            <input
              type="checkbox"
              checked={participants.skipInvalid}
              onChange={(e) => updateParticipants({ skipInvalid: e.target.checked })}
              className="size-4 accent-[var(--color-accent)]"
            />
            Skip the {invalidCount === 1 ? 'row' : `${invalidCount} rows`} that need fixing
          </label>
        )}
      </div>

      <ParticipantTable validation={validation} />
    </div>
  );
}

function ColumnSelect(props: {
  label: string;
  value: string | null;
  headers: string[];
  onChange: (column: string) => void;
  optional?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-fg">
        {props.label}
        {props.optional && <span className="font-normal text-muted"> (optional)</span>}
      </span>
      <select
        value={props.value ?? NOT_MAPPED}
        onChange={(e) => props.onChange(e.target.value)}
        className="h-9 w-full rounded-lg border border-line-strong bg-canvas px-2.5 text-sm text-fg hover:border-white/20"
      >
        <option value={NOT_MAPPED}>{props.optional ? 'None' : 'Choose a column…'}</option>
        {props.headers.map((header) => (
          <option key={header} value={header}>
            {header}
          </option>
        ))}
      </select>
    </label>
  );
}
