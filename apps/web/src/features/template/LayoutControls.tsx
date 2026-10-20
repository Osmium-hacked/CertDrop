import { CERT_FONT_META, CERT_FONTS, type Box, type Layout, type TextAlign } from '@certdrop/shared';
import { useState } from 'react';
import { Segmented } from '../../components/ui/Segmented';
import { Switch } from '../../components/ui/Switch';
import { fontFamily } from '../fonts/certFonts';
import type { EditableBox } from './LayoutEditor';

const MIN_SIZE = 12;
const MAX_SIZE = 120;

interface LayoutControlsProps {
  layout: Layout;
  onChange: (patch: Partial<Layout>) => void;
  pageAspect: number; // width / height, to keep the QR box square on the page
  selected: EditableBox;
  onSelect: (box: EditableBox) => void;
  onBoxChange: (box: EditableBox, value: Box) => void;
  compact: boolean;
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-fg">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  'h-9 rounded-lg border border-line-strong bg-canvas px-2.5 text-sm text-fg hover:border-white/20';

export function LayoutControls({
  layout,
  onChange,
  pageAspect,
  selected,
  onSelect,
  onBoxChange,
  compact,
}: LayoutControlsProps) {
  const [hex, setHex] = useState(layout.color);
  const selectedBox = selected === 'qr' ? layout.qrBox : layout.nameBox;

  const toggleQr = (on: boolean) => {
    if (!on) {
      onChange({ qrBox: null });
      onSelect('name');
      return;
    }
    // Square on the page: the same size in points along both axes.
    const width = 0.12;
    const height = width * pageAspect;
    // Inset from the corner, clear of the decorative borders most certificate designs have.
    onChange({ qrBox: { x: 1 - width - 0.08, y: 1 - height - 0.1, width, height } });
    onSelect('qr');
  };

  return (
    <div className="space-y-5">
      {layout.qrBox && (
        <Segmented
          label="Editing"
          value={selected}
          onChange={onSelect}
          options={[
            { value: 'name', label: 'Name' },
            { value: 'qr', label: 'QR code' },
          ]}
        />
      )}

      <fieldset>
        <legend className="mb-1.5 text-[13px] font-medium text-fg">Font</legend>
        <div className="grid grid-cols-1 gap-1.5">
          {CERT_FONTS.map((font) => (
            <label
              key={font}
              className={`flex h-10 cursor-pointer items-center justify-between rounded-lg border px-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent-fg ${
                layout.font === font
                  ? 'border-accent/70 bg-accent-soft'
                  : 'border-line-strong hover:border-white/20'
              }`}
            >
              <input
                type="radio"
                name="cert-font"
                value={font}
                checked={layout.font === font}
                onChange={() => onChange({ font })}
                className="sr-only"
              />
              <span className="text-[17px] text-fg" style={{ fontFamily: `"${fontFamily(font)}", serif` }}>
                {CERT_FONT_META[font].label}
              </span>
              <span className="text-[11px] tracking-wide text-muted uppercase">
                {CERT_FONT_META[font].category}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <Field label={`Size · ${layout.fontSize}pt`} htmlFor="font-size">
        <div className="flex items-center gap-3">
          <input
            id="font-size"
            type="range"
            min={MIN_SIZE}
            max={MAX_SIZE}
            value={layout.fontSize}
            onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
            className="flex-1 accent-[var(--color-accent)]"
          />
          <input
            type="number"
            aria-label="Font size in points"
            min={MIN_SIZE}
            max={MAX_SIZE}
            value={layout.fontSize}
            onChange={(e) => {
              const size = Number(e.target.value);
              if (size >= MIN_SIZE && size <= MAX_SIZE) onChange({ fontSize: size });
            }}
            className={`${inputClass} w-16 text-center tabular-nums`}
          />
        </div>
      </Field>

      <Field label="Colour" htmlFor="font-color">
        <div className="flex items-center gap-2">
          <input
            id="font-color"
            type="color"
            value={layout.color}
            onChange={(e) => {
              setHex(e.target.value);
              onChange({ color: e.target.value });
            }}
            className="h-9 w-11 cursor-pointer rounded-lg border border-line-strong bg-canvas p-1"
          />
          <input
            aria-label="Colour as hex"
            value={hex}
            onChange={(e) => {
              setHex(e.target.value);
              if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange({ color: e.target.value.toLowerCase() });
            }}
            spellCheck={false}
            className={`${inputClass} min-w-0 flex-1 font-mono`}
          />
        </div>
      </Field>

      <Segmented<TextAlign>
        label="Alignment"
        value={layout.align}
        onChange={(align) => onChange({ align })}
        options={[
          { value: 'left', label: 'Left' },
          { value: 'center', label: 'Centre' },
          { value: 'right', label: 'Right' },
        ]}
      />

      {compact && selectedBox && (
        <div className="space-y-3">
          <Field label="Box width" htmlFor="box-width">
            <input
              id="box-width"
              type="range"
              min={5}
              max={100}
              value={Math.round(selectedBox.width * 100)}
              onChange={(e) => {
                const width = Number(e.target.value) / 100;
                // The QR box stays square on the page.
                const height = selected === 'qr' ? width * pageAspect : selectedBox.height;
                onBoxChange(selected, {
                  ...selectedBox,
                  width,
                  height: Math.min(height, 1),
                  x: Math.min(selectedBox.x, 1 - width),
                  y: Math.min(selectedBox.y, 1 - Math.min(height, 1)),
                });
              }}
              className="w-full accent-[var(--color-accent)]"
            />
          </Field>
          {selected === 'name' && (
            <Field label="Box height" htmlFor="box-height">
              <input
                id="box-height"
                type="range"
                min={3}
                max={50}
                value={Math.round(selectedBox.height * 100)}
                onChange={(e) => {
                  const height = Number(e.target.value) / 100;
                  onBoxChange('name', { ...selectedBox, height, y: Math.min(selectedBox.y, 1 - height) });
                }}
                className="w-full accent-[var(--color-accent)]"
              />
            </Field>
          )}
          <p className="text-[13px] text-muted">Tap the certificate to move the selected box.</p>
        </div>
      )}

      <div className="border-t border-line pt-5">
        <Switch
          checked={layout.qrBox !== null}
          onChange={toggleQr}
          label="Add a verification QR code"
          description="Links to this certificate’s public verification page."
        />
      </div>
    </div>
  );
}
