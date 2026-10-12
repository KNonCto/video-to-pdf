import { useRef } from 'react';
import { Rect } from '../lib/image';
import { clampRect } from '../lib/cropDetect';

type Handle = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';
const HANDLES: Handle[] = ['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'];

export function CropEditor({
  imageUrl,
  rect,
  onChange,
}: {
  imageUrl: string;
  rect: Rect;
  onChange: (r: Rect) => void;
}) {
  const box = useRef<HTMLDivElement>(null);

  const start = (handle: Handle) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = box.current!;
    const bounds = el.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const r0 = rect;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / bounds.width;
      const dy = (ev.clientY - startY) / bounds.height;
      let { x, y, w, h } = r0;
      if (handle === 'move') {
        x = Math.min(Math.max(0, x + dx), 1 - w);
        y = Math.min(Math.max(0, y + dy), 1 - h);
      } else {
        if (handle.includes('w')) {
          const nx = Math.min(Math.max(0, x + dx), x + w - 0.05);
          w += x - nx;
          x = nx;
        }
        if (handle.includes('e')) w = Math.min(Math.max(0.05, w + dx), 1 - x);
        if (handle.includes('n')) {
          const ny = Math.min(Math.max(0, y + dy), y + h - 0.05);
          h += y - ny;
          y = ny;
        }
        if (handle.includes('s')) h = Math.min(Math.max(0.05, h + dy), 1 - y);
      }
      onChange(clampRect({ x, y, w, h }));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const pct = (v: number) => `${v * 100}%`;
  return (
    <div className="crop" ref={box}>
      <img src={imageUrl} alt="Fotograma del video" draggable={false} />
      <div
        className="crop-rect"
        style={{ left: pct(rect.x), top: pct(rect.y), width: pct(rect.w), height: pct(rect.h) }}
        onPointerDown={start('move')}
      >
        {HANDLES.map((h) => (
          <span key={h} className={`handle ${h}`} onPointerDown={start(h)} />
        ))}
      </div>
    </div>
  );
}
