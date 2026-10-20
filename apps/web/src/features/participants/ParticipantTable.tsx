import { ROW_ISSUE_LABELS, type ParticipantRow, type ValidationResult } from '@certdrop/shared';
import { useState, type KeyboardEvent } from 'react';
import { Segmented } from '../../components/ui/Segmented';
import { cn } from '../../lib/cn';
import { useBatchDraft } from '../batch/draft';

type Filter = 'issues' | 'all';

/** Rows with problems are highlighted and editable in place; valid rows are read-only. */
export function ParticipantTable({ validation }: { validation: ValidationResult }) {
  const [filter, setFilter] = useState<Filter>(validation.invalid.length > 0 ? 'issues' : 'all');
  const rows = filter === 'issues' ? validation.invalid : validation.rows;

  return (
    <div className="space-y-3">
      <div className="w-full sm:w-72">
        <Segmented
          label="Show"
          hideLabel
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'issues', label: `Needs fixing (${validation.invalid.length})` },
            { value: 'all', label: `All (${validation.rows.length})` },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong px-4 py-8 text-center text-sm text-muted">
          Every row is ready. Nothing needs fixing.
        </p>
      ) : (
        <div className="max-h-[420px] overflow-auto rounded-xl border border-line">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <caption className="sr-only">
              {filter === 'issues' ? 'Rows that need fixing' : 'All participants'}. Spreadsheet row numbers
              include the heading row.
            </caption>
            <thead className="sticky top-0 z-10 bg-elevated text-[11px] tracking-[0.06em] text-muted uppercase">
              <tr>
                <th scope="col" className="w-16 px-3 py-2 font-medium">
                  Row
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Name
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Email
                </th>
                <th scope="col" className="w-48 px-3 py-2 font-medium">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <ParticipantTableRow key={row.index} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ParticipantTableRow({ row }: { row: ParticipantRow }) {
  const { participants, updateParticipants } = useBatchDraft();
  const flagged = row.issues.length > 0;

  const commit = (field: 'name' | 'email', value: string) => {
    if (!participants || value === row[field]) return;
    const current = participants.overrides[row.index] ?? {};
    updateParticipants({
      overrides: { ...participants.overrides, [row.index]: { ...current, [field]: value } },
    });
  };

  return (
    <tr className={cn('border-t border-line', flagged && 'bg-danger-soft/60')}>
      {/* +2: spreadsheets number from 1 and the heading is row 1, so this matches what Excel shows. */}
      <td className="px-3 py-2 align-top text-muted tabular-nums">{row.index + 2}</td>
      <td className="px-3 py-2 align-top">
        {flagged ? (
          // Keyed by value so a remap or external change resets the draft text.
          <EditableCell
            key={row.name}
            label={`Name in row ${row.index + 2}`}
            value={row.name}
            onCommit={(v) => commit('name', v)}
          />
        ) : (
          <span className="text-fg">{row.name}</span>
        )}
      </td>
      <td className="px-3 py-2 align-top">
        {flagged ? (
          <EditableCell
            key={row.email}
            label={`Email in row ${row.index + 2}`}
            value={row.email}
            onCommit={(v) => commit('email', v)}
          />
        ) : (
          <span className="text-muted">{row.email}</span>
        )}
      </td>
      <td className="px-3 py-2 align-top">
        {flagged ? (
          <ul className="space-y-0.5 text-[13px] text-danger">
            {row.issues.map((issue) => (
              <li key={issue}>{ROW_ISSUE_LABELS[issue]}</li>
            ))}
          </ul>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-ok-soft px-2 py-0.5 text-xs font-medium text-ok">
            <span aria-hidden className="size-1.5 rounded-full bg-current" />
            Ready
          </span>
        )}
      </td>
    </tr>
  );
}

/**
 * Commits on blur or Enter, not on every keystroke: re-validating mid-word would make a row
 * jump out of the "Needs fixing" list while it's being typed.
 */
function EditableCell({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur();
    if (e.key === 'Escape') setDraft(value);
  };
  return (
    <input
      aria-label={label}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={onKeyDown}
      placeholder="Missing"
      className="h-8 w-full min-w-0 rounded-md border border-danger/40 bg-canvas px-2 text-sm text-fg placeholder:text-danger/70 focus:border-accent-fg"
    />
  );
}
