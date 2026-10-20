import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Button } from './Button';

interface FileDropProps {
  title: string;
  description: ReactNode;
  accept: string;
  icon: ReactNode;
  onFile: (file: File) => void;
  disabled?: boolean;
  /** Extra content under the button, e.g. a "download a sample" link. */
  footer?: ReactNode;
}

/** Drop target plus a real file button, so it works with mouse, keyboard and touch alike. */
export function FileDrop({ title, description, accept, icon, onFile, disabled, footer }: FileDropProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && !disabled) onFile(file);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-14 text-center transition-colors',
        dragging ? 'border-accent-fg bg-accent-soft' : 'border-line-strong',
      )}
    >
      <div
        aria-hidden
        className="mb-4 grid size-10 place-items-center rounded-lg border border-line bg-elevated text-muted"
      >
        {icon}
      </div>
      <p className="text-sm font-medium text-fg">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>
      <Button
        variant="secondary"
        className="mt-5"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
      >
        Choose file
      </Button>
      {footer && <div className="mt-4">{footer}</div>}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ''; // allow choosing the same file again after an error
          if (file) onFile(file);
        }}
      />
    </div>
  );
}
