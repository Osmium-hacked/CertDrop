import type { Box, Layout } from '@certdrop/shared';
import { useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '../../components/ui/Button';
import { Segmented } from '../../components/ui/Segmented';
import { Skeleton } from '../../components/ui/Skeleton';
import { useBatchDraft, type LoadedTemplate } from '../batch/draft';
import { useCertFontsReady } from '../fonts/certFonts';
import { LayoutControls } from './LayoutControls';
import { LayoutEditor, type EditableBox } from './LayoutEditor';
import { usePreviewFit } from './usePreviewFit';

const DEFAULT_SAMPLE = 'Alexandra Montgomery';
/** Stand-in until participants are uploaded: long enough to show how the box handles overflow. */
const LONGEST_SAMPLE = 'Maximiliana Konstantinopoulou-Wetherby';

const COMPACT_QUERY = '(max-width: 639px), (pointer: coarse)';
const subscribeCompact = (onChange: () => void) => {
  const mq = window.matchMedia(COMPACT_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
};
/** Phones and touch screens get tap-to-place instead of drag handles. */
const useCompact = () =>
  useSyncExternalStore(subscribeCompact, () => window.matchMedia(COMPACT_QUERY).matches);

interface LayoutWorkspaceProps {
  template: LoadedTemplate;
  onReplace: (file: File) => void;
}

export function LayoutWorkspace({ template, onReplace }: LayoutWorkspaceProps) {
  const { layout, updateLayout } = useBatchDraft();
  const fontsReady = useCertFontsReady();
  const compact = useCompact();
  const [selected, setSelected] = useState<EditableBox>('name');
  const [previewMode, setPreviewMode] = useState<'sample' | 'longest'>('sample');
  const [sample, setSample] = useState(DEFAULT_SAMPLE);
  const replaceRef = useRef<HTMLInputElement>(null);

  const previewName = previewMode === 'longest' ? LONGEST_SAMPLE : sample.trim() || DEFAULT_SAMPLE;
  const preview = usePreviewFit(previewName, layout, template, fontsReady);
  const longest = usePreviewFit(LONGEST_SAMPLE, layout, template, fontsReady);

  const onBoxChange = (which: EditableBox, box: Box) =>
    updateLayout(which === 'name' ? { nameBox: box } : ({ qrBox: box } satisfies Partial<Layout>));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-[13px] text-muted">
            <span className="text-fg">{template.fileName}</span> · {Math.round(template.widthPt)}×
            {Math.round(template.heightPt)}pt
          </p>
          <Button variant="ghost" size="sm" onClick={() => replaceRef.current?.click()}>
            Replace
          </Button>
          <input
            ref={replaceRef}
            type="file"
            accept="image/png,image/jpeg,application/pdf"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) onReplace(file);
            }}
          />
        </div>

        {fontsReady ? (
          <LayoutEditor
            template={template}
            layout={layout}
            preview={preview}
            selected={selected}
            onSelect={setSelected}
            onBoxChange={onBoxChange}
            compact={compact}
          />
        ) : (
          <Skeleton className="aspect-[1.414] w-full" />
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="sm:w-60">
            <Segmented
              label="Preview with"
              value={previewMode}
              onChange={setPreviewMode}
              options={[
                { value: 'sample', label: 'Sample name' },
                { value: 'longest', label: 'Longest name' },
              ]}
            />
          </div>
          {previewMode === 'sample' && (
            <div className="flex-1">
              <label htmlFor="sample-name" className="sr-only">
                Sample name
              </label>
              <input
                id="sample-name"
                value={sample}
                onChange={(e) => setSample(e.target.value)}
                placeholder="Type a name to preview"
                className="h-9 w-full rounded-lg border border-line-strong bg-canvas px-3 text-sm text-fg placeholder:text-muted/70"
              />
            </div>
          )}
        </div>

        <div className="space-y-2" aria-live="polite">
          <p className="text-[13px] text-muted">
            Shown at {preview.fit.fontSize}pt{preview.fit.lines.length > 1 ? ' on two lines' : ''}. Long names
            shrink, then wrap, to stay inside the box.
          </p>
          {longest.fit.belowMinimum && (
            <p className="rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-[13px] text-warn">
              Very long names would drop below {longest.minSize}pt here. Widen the box or lower the font size.
            </p>
          )}
          {preview.unsupported.length > 0 && (
            <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">
              These characters can’t be rendered on certificates: {preview.unsupported.join(' ')}
            </p>
          )}
        </div>
      </div>

      <LayoutControls
        layout={layout}
        onChange={updateLayout}
        pageAspect={template.widthPt / template.heightPt}
        selected={selected}
        onSelect={setSelected}
        onBoxChange={onBoxChange}
        compact={compact}
      />
    </div>
  );
}
