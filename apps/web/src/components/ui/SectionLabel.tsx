import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

/** Small uppercase label above a section, e.g. "STEP 2 · TEMPLATE". */
export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('text-[11px] font-medium tracking-[0.08em] text-muted uppercase', className)}>
      {children}
    </p>
  );
}
