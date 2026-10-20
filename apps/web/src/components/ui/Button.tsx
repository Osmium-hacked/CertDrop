import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variants: Record<Variant, string> = {
  primary:
    'bg-accent text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.12)] hover:bg-accent-hover disabled:bg-accent/40 disabled:text-white/60',
  secondary: 'border border-line-strong bg-elevated text-fg hover:bg-white/[0.06] disabled:text-muted',
  ghost: 'text-muted hover:bg-white/[0.04] hover:text-fg disabled:text-muted/60',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-10 px-4 text-sm',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors duration-150 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
