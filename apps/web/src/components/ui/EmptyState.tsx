import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line-strong px-6 py-14 text-center">
      <div
        aria-hidden
        className="mb-4 grid size-10 place-items-center rounded-lg border border-line bg-elevated text-muted"
      >
        {icon}
      </div>
      <h3 className="text-sm font-medium text-fg">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
