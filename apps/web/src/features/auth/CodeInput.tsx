import { OTP_POLICY } from '@certdrop/shared';
import { useState, type RefObject } from 'react';
import { cn } from '../../lib/cn';

interface CodeInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Called once all digits are entered (typed, pasted or autofilled from the SMS/email bar). */
  onComplete: (code: string) => void;
  /**
   * While a check is in flight. Implemented as readOnly rather than disabled: a disabled input
   * drops focus, so the organizer would have to click back in after a wrong code.
   */
  busy?: boolean;
  invalid?: boolean;
  describedBy?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
}

/**
 * One real <input> drawn as six boxes. A single input (rather than six) keeps paste, the
 * browser's one-time-code autofill and screen readers working without any special handling;
 * the boxes are purely visual and hidden from assistive tech.
 */
export function CodeInput({
  value,
  onChange,
  onComplete,
  busy,
  invalid,
  describedBy,
  inputRef,
}: CodeInputProps) {
  const [focused, setFocused] = useState(false);
  const length = OTP_POLICY.length;

  return (
    <div className="relative inline-block">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '').slice(0, length);
          onChange(digits);
          if (digits.length === length) onComplete(digits);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        readOnly={busy}
        aria-busy={busy || undefined}
        inputMode="numeric"
        autoComplete="one-time-code"
        aria-label={`${length}-digit code`}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        maxLength={length}
        spellCheck={false}
        className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0"
      />
      <div aria-hidden className="flex gap-2">
        {Array.from({ length }, (_, i) => {
          const char = value[i];
          const isCaret = focused && i === Math.min(value.length, length - 1);
          return (
            <div
              key={i}
              className={cn(
                'grid h-12 w-10 place-items-center rounded-lg border bg-canvas font-mono text-xl text-fg transition-colors sm:h-14 sm:w-12',
                invalid
                  ? 'border-danger/60'
                  : isCaret
                    ? 'border-accent-fg ring-2 ring-accent/30'
                    : 'border-line-strong',
                busy && 'opacity-60',
              )}
            >
              {char ?? (isCaret ? <span className="h-5 w-px animate-pulse bg-fg" /> : null)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
