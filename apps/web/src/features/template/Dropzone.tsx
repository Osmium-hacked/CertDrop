import { useRef, useState, type DragEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { ImageIcon } from '../../components/ui/icons';
import { cn } from '../../lib/cn';

const ACCEPT = 'image/png,image/jpeg,application/pdf,.png,.jpg,.jpeg,.pdf';

/** Drop target plus a real file button, so it works with mouse, keyboard and touch alike. */
export function Dropzone({ onFile, disabled }: { onFile: (file: File) => void; disabled?: boolean }) {
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
        <ImageIcon />
      </div>
      <p className="text-sm font-medium text-fg">Drop your certificate design here</p>
      <p className="mt-1 max-w-sm text-sm text-muted">
        PNG, JPG or a single-page PDF, up to 10 MB. Exports from Canva, Figma or Illustrator work well.
      </p>
      <Button
        variant="secondary"
        className="mt-5"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
      >
        Choose file
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
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
