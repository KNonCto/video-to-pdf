import { useEffect, useRef, useState } from 'react';
import { Rect } from '../lib/image';

/**
 * Muestra el mismo <video> que se está analizando: se ve saltar de muestra en muestra,
 * con el recorte marcado y un aviso cada vez que se guarda una diapositiva.
 */
export function LivePreview({ video, rect, captured }: { video: HTMLVideoElement; rect: Rect; captured: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    video.className = 'live-video';
    el.prepend(video);
    return () => {
      video.remove();
      video.className = '';
    };
  }, [video]);

  useEffect(() => {
    if (!captured) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 900);
    return () => clearTimeout(t);
  }, [captured]);

  const pct = (v: number) => `${v * 100}%`;
  return (
    <div className="live" ref={box} data-testid="live-preview">
      <div
        className={`live-rect ${flash ? 'flash' : ''}`}
        style={{ left: pct(rect.x), top: pct(rect.y), width: pct(rect.w), height: pct(rect.h) }}
      />
      {flash && <span className="live-badge">Diapositiva {captured} guardada</span>}
    </div>
  );
}
