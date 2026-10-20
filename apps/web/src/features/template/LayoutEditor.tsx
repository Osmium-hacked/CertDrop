import type { Box, Layout } from '@certdrop/shared';
import type Konva from 'konva';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Image as KonvaImage, Layer, Rect, Shape, Stage, Transformer } from 'react-konva';
import type { LoadedTemplate } from '../batch/draft';
import { cssFont } from '../fonts/certFonts';
import type { PreviewFit } from './usePreviewFit';

export type EditableBox = 'name' | 'qr';

interface LayoutEditorProps {
  template: LoadedTemplate;
  layout: Layout;
  preview: PreviewFit;
  selected: EditableBox;
  onSelect: (box: EditableBox) => void;
  onBoxChange: (box: EditableBox, value: Box) => void;
  /** Touch-sized screens: no drag handles; tapping the page moves the selected box there. */
  compact: boolean;
}

// Mid-tone violet: stays visible on both light (most certificates) and dark template designs.
const ACCENT = '#6e5fd6';
const ACCENT_MUTED = 'rgba(110, 95, 214, 0.55)';
const MIN_BOX_PX = 16;
const NUDGE = 0.005;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Keeps a normalized box fully on the page. */
function clampBox(box: Box): Box {
  const width = clamp(box.width, 0.01, 1);
  const height = clamp(box.height, 0.01, 1);
  return { width, height, x: clamp(box.x, 0, 1 - width), y: clamp(box.y, 0, 1 - height) };
}

/**
 * Canvas editor for the name box and optional QR box. Boxes are stored normalized (0..1 of the
 * page), so the editor can render at any size; this component converts to pixels and back.
 */
export function LayoutEditor({
  template,
  layout,
  preview,
  selected,
  onSelect,
  onBoxChange,
  compact,
}: LayoutEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const nameRef = useRef<Konva.Rect>(null);
  const qrRef = useRef<Konva.Rect>(null);
  const transformerRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setContainerWidth(entry?.contentRect.width ?? 0));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Fit the page inside the container, and inside ~70% of the viewport height for tall templates.
  const maxHeight = Math.min(window.innerHeight * 0.7, 720);
  const scale = Math.min(containerWidth / template.widthPt, maxHeight / template.heightPt) || 0;
  const stageWidth = template.widthPt * scale;
  const stageHeight = template.heightPt * scale;

  const toPx = (box: Box) => ({
    x: box.x * stageWidth,
    y: box.y * stageHeight,
    width: box.width * stageWidth,
    height: box.height * stageHeight,
  });
  const fromNode = (node: Konva.Node): Box =>
    clampBox({
      x: node.x() / stageWidth,
      y: node.y() / stageHeight,
      width: (node.width() * node.scaleX()) / stageWidth,
      height: (node.height() * node.scaleY()) / stageHeight,
    });

  const boxFor = (which: EditableBox): Box | null => (which === 'name' ? layout.nameBox : layout.qrBox);

  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    const node = selected === 'name' ? nameRef.current : qrRef.current;
    transformer.nodes(node && !compact ? [node] : []);
    transformer.getLayer()?.batchDraw();
  }, [selected, compact, layout.qrBox, stageWidth]);

  const commit = (which: EditableBox, node: Konva.Node) => {
    const box = fromNode(node);
    node.scaleX(1);
    node.scaleY(1);
    onBoxChange(which, box);
  };

  /** Tap-to-place: centre the selected box on the tapped point. */
  const placeAt = (stage: Konva.Stage | null) => {
    const pointer = stage?.getPointerPosition();
    const box = boxFor(selected);
    if (!pointer || !box) return;
    onBoxChange(
      selected,
      clampBox({
        ...box,
        x: pointer.x / stageWidth - box.width / 2,
        y: pointer.y / stageHeight - box.height / 2,
      }),
    );
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const box = boxFor(selected);
    const step = e.shiftKey ? NUDGE * 4 : NUDGE;
    const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[
      e.key
    ];
    if (!box || !delta) return;
    e.preventDefault();
    onBoxChange(selected, clampBox({ ...box, x: box.x + delta[0]!, y: box.y + delta[1]! }));
  };

  const nameBox = toPx(layout.nameBox);
  const qrBox = layout.qrBox ? toPx(layout.qrBox) : null;
  const stroke = (which: EditableBox) => (selected === which ? ACCENT : ACCENT_MUTED);

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      role="application"
      aria-label={`Certificate layout editor. ${selected === 'name' ? 'Name box' : 'QR code box'} selected. Use the arrow keys to move it; hold Shift for larger steps.`}
      className="w-full rounded-lg"
    >
      {scale > 0 && (
        <Stage
          width={stageWidth}
          height={stageHeight}
          className="overflow-hidden rounded-lg shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
        >
          <Layer>
            <KonvaImage
              image={template.raster}
              width={stageWidth}
              height={stageHeight}
              onClick={(e) => compact && placeAt(e.target.getStage())}
              onTap={(e) => compact && placeAt(e.target.getStage())}
            />

            {/* Live name preview, drawn exactly where the PDF renderer will put it. */}
            <Shape
              listening={false}
              sceneFunc={(ctx) => {
                ctx.setAttr('font', cssFont(layout.font, preview.fit.fontSize * scale));
                ctx.setAttr('fillStyle', layout.color);
                ctx.setAttr('textBaseline', 'alphabetic');
                for (const line of preview.lines) {
                  ctx.fillText(line.text, nameBox.x + line.x * scale, nameBox.y + line.baseline * scale);
                }
              }}
            />

            <Rect
              ref={nameRef}
              {...nameBox}
              stroke={stroke('name')}
              strokeWidth={1.5}
              dash={[6, 4]}
              fill={selected === 'name' ? 'rgba(124,110,224,0.10)' : 'rgba(255,255,255,0.04)'}
              draggable={!compact}
              onMouseDown={() => onSelect('name')}
              onTap={() => onSelect('name')}
              onDragEnd={(e) => commit('name', e.target)}
              onTransformEnd={(e) => commit('name', e.target)}
              dragBoundFunc={(pos) => ({
                x: clamp(pos.x, 0, stageWidth - nameBox.width),
                y: clamp(pos.y, 0, stageHeight - nameBox.height),
              })}
            />

            {qrBox && (
              <>
                <Shape
                  listening={false}
                  sceneFunc={(ctx) =>
                    drawQrPlaceholder(ctx, qrBox.x, qrBox.y, Math.min(qrBox.width, qrBox.height))
                  }
                />
                <Rect
                  ref={qrRef}
                  {...qrBox}
                  stroke={stroke('qr')}
                  strokeWidth={1.5}
                  dash={[6, 4]}
                  draggable={!compact}
                  onMouseDown={() => onSelect('qr')}
                  onTap={() => onSelect('qr')}
                  onDragEnd={(e) => commit('qr', e.target)}
                  onTransformEnd={(e) => commit('qr', e.target)}
                  dragBoundFunc={(pos) => ({
                    x: clamp(pos.x, 0, stageWidth - qrBox.width),
                    y: clamp(pos.y, 0, stageHeight - qrBox.height),
                  })}
                />
              </>
            )}

            <Transformer
              ref={transformerRef}
              rotateEnabled={false}
              keepRatio={selected === 'qr'}
              enabledAnchors={
                selected === 'qr'
                  ? ['top-left', 'top-right', 'bottom-left', 'bottom-right']
                  : [
                      'top-left',
                      'top-right',
                      'bottom-left',
                      'bottom-right',
                      'middle-left',
                      'middle-right',
                      'top-center',
                      'bottom-center',
                    ]
              }
              anchorSize={9}
              anchorCornerRadius={2}
              anchorStroke={ACCENT}
              borderStroke={ACCENT}
              ignoreStroke
              boundBoxFunc={(oldBox, newBox) => {
                const inside =
                  newBox.x >= -0.5 &&
                  newBox.y >= -0.5 &&
                  newBox.x + newBox.width <= stageWidth + 0.5 &&
                  newBox.y + newBox.height <= stageHeight + 0.5;
                return inside && newBox.width >= MIN_BOX_PX && newBox.height >= MIN_BOX_PX ? newBox : oldBox;
              }}
            />
          </Layer>
        </Stage>
      )}
    </div>
  );
}

/** A schematic QR code: three finder squares on white. The real code is generated per certificate. */
function drawQrPlaceholder(ctx: Konva.Context, x: number, y: number, size: number) {
  ctx.setAttr('fillStyle', '#ffffff');
  ctx.fillRect(x, y, size, size);
  const cell = size / 25;
  ctx.setAttr('fillStyle', '#111111');
  for (const [cx, cy] of [
    [2, 2],
    [16, 2],
    [2, 16],
  ] as const) {
    ctx.fillRect(x + cx * cell, y + cy * cell, 7 * cell, 7 * cell);
    ctx.setAttr('fillStyle', '#ffffff');
    ctx.fillRect(x + (cx + 1) * cell, y + (cy + 1) * cell, 5 * cell, 5 * cell);
    ctx.setAttr('fillStyle', '#111111');
    ctx.fillRect(x + (cx + 2) * cell, y + (cy + 2) * cell, 3 * cell, 3 * cell);
  }
  for (let i = 0; i < 60; i++) {
    // Deterministic speckle so the placeholder doesn't flicker between renders.
    const px = 10 + ((i * 7) % 13);
    const py = 10 + ((i * 11) % 13);
    ctx.fillRect(x + px * cell, y + py * cell, cell, cell);
  }
}
