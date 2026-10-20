import { useId, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: ReactNode; title?: string }>;
  onChange: (value: T) => void;
  hideLabel?: boolean;
}

/** Radio group styled as a segmented control: native radios keep arrow-key navigation for free. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  hideLabel,
}: SegmentedProps<T>) {
  const name = useId();
  return (
    <fieldset>
      <legend className={cn('mb-1.5 text-[13px] font-medium text-fg', hideLabel && 'sr-only')}>
        {label}
      </legend>
      <div className="flex rounded-lg border border-line-strong bg-canvas p-0.5">
        {options.map((option) => (
          <label
            key={option.value}
            title={option.title}
            className={cn(
              'flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md text-[13px] transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent-fg',
              value === option.value
                ? 'bg-elevated text-fg shadow-[0_0_0_1px_rgb(255_255_255/0.08)]'
                : 'text-muted hover:text-fg',
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
