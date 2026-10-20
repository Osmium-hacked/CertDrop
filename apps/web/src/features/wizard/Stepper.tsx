import { CheckIcon } from '../../components/ui/icons';
import { cn } from '../../lib/cn';
import type { StepDefinition } from './steps';

interface StepperProps {
  steps: readonly StepDefinition[];
  current: number;
  /** Highest step index the organizer has reached; any step up to it can be revisited. */
  furthest: number;
  onSelect: (index: number) => void;
}

export function Stepper({ steps, current, furthest, onSelect }: StepperProps) {
  return (
    <nav aria-label="Progress">
      <ol className="flex items-center gap-1 sm:gap-2">
        {steps.map((step, index) => {
          const done = index < furthest && index !== current;
          const active = index === current;
          const reachable = index <= furthest;
          return (
            // Connector lines absorb the spare width (and shrink first), so labels never truncate.
            <li
              key={step.id}
              className={cn('flex items-center gap-1 sm:gap-2', index < steps.length - 1 && 'flex-1')}
            >
              <button
                type="button"
                onClick={() => onSelect(index)}
                disabled={!reachable}
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'group flex shrink-0 items-center gap-2 rounded-md px-1.5 py-1 text-[13px] whitespace-nowrap transition-colors',
                  reachable && !active && 'hover:bg-white/[0.04]',
                  !reachable && 'cursor-default',
                )}
              >
                <span
                  className={cn(
                    'grid size-5 shrink-0 place-items-center rounded-full border text-[11px] font-medium tabular-nums transition-colors',
                    active && 'border-accent bg-accent text-white',
                    done && 'border-accent/50 bg-accent-soft text-accent-fg',
                    !active && !done && 'border-line-strong text-muted',
                  )}
                >
                  {done ? <CheckIcon width={12} height={12} strokeWidth={2} /> : index + 1}
                </span>
                {/* Labels collapse to numbers on narrow screens; the active label stays visible. */}
                <span
                  className={cn(
                    active ? 'font-medium text-fg' : 'hidden text-muted sm:inline',
                    reachable && !active && 'group-hover:text-fg',
                  )}
                >
                  {step.label}
                </span>
                <span className="sr-only">
                  {done ? '(completed)' : !reachable ? '(not yet available)' : ''}
                </span>
              </button>
              {index < steps.length - 1 && (
                <span aria-hidden className="h-px min-w-3 flex-1 bg-line-strong" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
