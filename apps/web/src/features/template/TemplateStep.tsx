import { sniffTemplateType, TEMPLATE_MAX_BYTES } from '@certdrop/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Spinner } from '../../components/ui/Spinner';
import { ApiRequestError } from '../../lib/api';
import { useBatchDraft } from '../batch/draft';
import { FileDrop } from '../../components/ui/FileDrop';
import { ImageIcon } from '../../components/ui/icons';
import { LayoutWorkspace } from './LayoutWorkspace';
import { rasterizeTemplate } from './rasterize';
import { uploadTemplate, type UploadPhase } from './upload';

interface Progress {
  fileName: string;
  phase: UploadPhase | 'reading';
  fraction: number;
}

/** Step 2: upload the design, then place the name (and optionally a QR code) on it. */
export default function TemplateStep() {
  const { template, setTemplate } = useBatchDraft();
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<Progress | null>(null);

  const handleFile = async (file: File) => {
    // Fast client-side checks for a friendly message; the server repeats them authoritatively.
    if (file.size > TEMPLATE_MAX_BYTES) {
      toast.error('That file is over 10 MB. Export it at a lower resolution or as a PDF.');
      return;
    }
    const type = sniffTemplateType(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
    if (!type) {
      toast.error('Upload a PNG, JPG or PDF file.');
      return;
    }

    setProgress({ fileName: file.name, phase: 'reading', fraction: 0 });
    try {
      // Render locally and upload in parallel: the preview is ready the moment the server approves.
      // allSettled (not all) so a fast local failure can't leave the upload updating progress in
      // the background after this attempt has already ended.
      const [raster, verified] = await Promise.allSettled([
        rasterizeTemplate(file, type),
        uploadTemplate(file, type, (phase, fraction) =>
          setProgress({ fileName: file.name, phase, fraction }),
        ),
      ]);
      // The server's verdict comes first: its message says exactly what is wrong with the file.
      if (verified.status === 'rejected') throw verified.reason;
      if (raster.status === 'rejected') throw raster.reason;
      setTemplate({ ...verified.value, fileName: file.name, raster: raster.value });
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) {
        queryClient.setQueryData(['session'], { organizer: null });
      }
      toast.error(
        err instanceof ApiRequestError ? err.message : 'We couldn’t read that file. Try exporting it again.',
      );
    } finally {
      setProgress(null);
    }
  };

  if (progress) return <UploadProgress {...progress} />;
  if (template) return <LayoutWorkspace template={template} onReplace={(file) => void handleFile(file)} />;
  return (
    <FileDrop
      title="Drop your certificate design here"
      description="PNG, JPG or a single-page PDF, up to 10 MB. Exports from Canva, Figma or Illustrator work well."
      accept="image/png,image/jpeg,application/pdf,.png,.jpg,.jpeg,.pdf"
      icon={<ImageIcon />}
      onFile={(file) => void handleFile(file)}
    />
  );
}

function UploadProgress({ fileName, phase, fraction }: Progress) {
  const label =
    phase === 'checking'
      ? 'Checking the file…'
      : phase === 'reading'
        ? 'Preparing…'
        : `Uploading ${Math.round(fraction * 100)}%`;
  return (
    <div className="rounded-xl border border-line bg-elevated/60 p-5" role="status" aria-live="polite">
      <div className="flex items-center gap-3">
        <Spinner className="text-muted" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-fg">{fileName}</p>
          <p className="text-[13px] text-muted">{label}</p>
        </div>
      </div>
      <div className="mt-4 h-1 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-200"
          style={{
            width: `${Math.round((phase === 'uploading' ? fraction : phase === 'checking' ? 1 : 0.05) * 100)}%`,
          }}
        />
      </div>
    </div>
  );
}
