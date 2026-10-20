import { useId } from 'react';
import { cn } from '../../lib/cn';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
}

export function Switch({ checked, onChange, label, description }: SwitchProps) {
  const id = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={`${id}-label`}
      aria-describedby={description ? `${id}-description` : undefined}
      onClick={() => onChange(!checked)}
      className="flex w-full items-start justify-between gap-3 rounded-lg text-left"
    >
      <span>
        <span id={`${id}-label`} className="block text-[13px] font-medium text-fg">
          {label}
        </span>
        {description && (
          <span id={`${id}-description`} className="mt-0.5 block text-[13px] text-muted">
            {description}
          </span>
        )}
      </span>
      <span
        aria-hidden
        className={cn(
          'relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors',
          checked ? 'border-accent bg-accent' : 'border-line-strong bg-white/[0.06]',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-3.5 rounded-full bg-white transition-transform',
            checked ? 'translate-x-[18px]' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  );
}
