import { cn } from '../../lib/cn';

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-white/[0.06]', className)} />;
}
