import { CERT_FONT_META, fitName, minFontSize, type BatchCreate } from '@certdrop/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/Button';
import { SendIcon } from '../../components/ui/icons';
import { Spinner } from '../../components/ui/Spinner';
import { ApiRequestError } from '../../lib/api';
import { useSession } from '../auth/session';
import { useBatchDraft, type LoadedTemplate } from '../batch/draft';
import { measureWith, useCertFontsReady } from '../fonts/certFonts';
import { drawName, drawQrPlaceholder } from '../template/drawName';
import { usePreviewFit } from '../template/usePreviewFit';
import { useCreateBatch } from './batchApi';

/** Everything that will happen, in one place, before anything is sent. */
export function ConfirmSend() {
  const { template, layout, event, participants, validation, setBatchId } = useBatchDraft();
  const session = useSession();
  const queryClient = useQueryClient();
  const create = useCreateBatch();
  const fontsReady = useCertFontsReady();

  const recipients = useMemo(() => validation?.valid ?? [], [validation]);
  const skipped = participants?.skipInvalid ? (validation?.invalid.length ?? 0) : 0;

  // How many names will print below the minimum size, so it isn't a surprise afterwards.
  const smallNames = useMemo(() => {
    if (!template || !fontsReady) return 0;
    const measure = measureWith(layout.font);
    const box = {
      width: layout.nameBox.width * template.widthPt,
      height: layout.nameBox.height * template.heightPt,
    };
    return recipients.filter((r) => fitName(r.name, box, layout.fontSize, measure).belowMinimum).length;
  }, [recipients, template, layout, fontsReady]);

  if (!template || recipients.length === 0) return null;

  const send = () => {
    const body: BatchCreate = {
      templateId: template.id,
      layout,
      event,
      recipients: recipients.map((r) => ({ name: r.name, email: r.email })),
    };
    create.mutate(body, {
      onSuccess: ({ batch }) => setBatchId(batch.id),
      onError: (err) => {
        if (err instanceof ApiRequestError && err.status === 401) {
          queryClient.setQueryData(['session'], { organizer: null });
        }
        toast.error(
          err instanceof ApiRequestError ? err.message : 'Couldn’t start sending. Please try again.',
        );
      },
    });
  };

  const issueDate = new Date(`${event.issueDate}T00:00:00`).toLocaleDateString(undefined, {
    dateStyle: 'long',
  });
  const rows: Array<[string, string]> = [
    ['Event', event.eventName],
    ['Issued by', event.issuerName],
    ['Issue date', issueDate],
    ['Template', template.fileName],
    ['Name font', `${CERT_FONT_META[layout.font].label}, up to ${layout.fontSize}pt`],
    ['Verification QR', layout.qrBox ? 'Included' : 'Not included'],
    ['Replies go to', session.data?.organizer?.email ?? 'you'],
  ];

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-3">
        <CertificateThumbnail template={template} name={recipients[0]!.name} fontsReady={fontsReady} />
        <p className="text-[13px] text-muted">Preview: {recipients[0]!.name}’s certificate</p>
      </div>

      <div className="space-y-6">
        <div>
          <p className="text-3xl font-semibold tracking-[var(--tracking-heading)] tabular-nums">
            {recipients.length.toLocaleString()}
          </p>
          <p className="text-sm text-muted">
            {recipients.length === 1 ? 'certificate' : 'certificates'} will be generated and emailed
            {skipped > 0 && ` · ${skipped} skipped`}
          </p>
        </div>

        <dl className="divide-y divide-line rounded-xl border border-line text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 px-4 py-2.5">
              <dt className="text-muted">{label}</dt>
              <dd className="min-w-0 truncate text-right text-fg">{value}</dd>
            </div>
          ))}
        </dl>

        {smallNames > 0 && (
          <p className="rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-[13px] text-warn">
            {smallNames} {smallNames === 1 ? 'name' : 'names'} will print smaller than{' '}
            {minFontSize(layout.fontSize)}pt. Go back to the template step to widen the box if that matters.
          </p>
        )}

        <Button variant="primary" className="w-full" onClick={send} disabled={create.isPending}>
          {create.isPending ? <Spinner /> : <SendIcon />}
          Generate & send {recipients.length.toLocaleString()}{' '}
          {recipients.length === 1 ? 'certificate' : 'certificates'}
        </Button>
        <p className="text-center text-[13px] text-muted">
          Each participant gets their own email with the PDF attached.
        </p>
      </div>
    </div>
  );
}

/** Static render of the template with one real name, drawn by the same code as the editor. */
function CertificateThumbnail({
  template,
  name,
  fontsReady,
}: {
  template: LoadedTemplate;
  name: string;
  fontsReady: boolean;
}) {
  const { layout } = useBatchDraft();
  const preview = usePreviewFit(name, layout, template, fontsReady);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const width = canvas.clientWidth * window.devicePixelRatio;
    const scale = width / template.widthPt;
    canvas.width = width;
    canvas.height = template.heightPt * scale;
    ctx.drawImage(template.raster, 0, 0, canvas.width, canvas.height);
    drawName(ctx, layout, preview, canvas.width, canvas.height, scale);
    if (layout.qrBox) {
      const size = Math.min(layout.qrBox.width * canvas.width, layout.qrBox.height * canvas.height);
      drawQrPlaceholder(ctx, layout.qrBox.x * canvas.width, layout.qrBox.y * canvas.height, size);
    }
  }, [template, layout, preview]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={`Certificate preview for ${name}`}
      className="w-full rounded-lg shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
      style={{ aspectRatio: `${template.widthPt} / ${template.heightPt}` }}
    />
  );
}
