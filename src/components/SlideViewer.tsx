import { useEffect, useRef } from 'react';
import { ExtractedSlide } from '../lib/pipeline';
import { formatTime } from '../lib/video';

export function SlideViewer({
  slides,
  index,
  onClose,
  onNavigate,
  onChoose,
  selected,
  onToggle,
}: {
  slides: ExtractedSlide[];
  index: number;
  onClose: () => void;
  onNavigate: (i: number) => void;
  onChoose: (id: number, variantIndex: number) => void;
  selected: boolean;
  onToggle?: (id: number) => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const s = slides[index];
  const hasPrev = index > 0;
  const hasNext = index < slides.length - 1;

  useEffect(() => {
    dialog.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && hasPrev) onNavigate(index - 1);
      else if (e.key === 'ArrowRight' && hasNext) onNavigate(index + 1);
      else if (s && onToggle && (e.key === 'x' || e.key === 'X')) onToggle(s.id);
      else if (s && /^[1-9]$/.test(e.key)) {
        const v = Number(e.key) - 1;
        if (v < s.variants.length) onChoose(s.id, v);
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, hasPrev, hasNext, s, onClose, onNavigate, onChoose, onToggle]);

  if (!s) return null;
  const image = s.variants[s.chosen];

  return (
    <div className="viewer-backdrop" onClick={onClose}>
      <div
        className="viewer"
        role="dialog"
        aria-modal="true"
        aria-label={`Diapositiva ${index + 1}`}
        tabIndex={-1}
        ref={dialog}
        onClick={(e) => e.stopPropagation()}
        data-testid="slide-viewer"
      >
        <div className="viewer-header">
          <span>
            Diapositiva {index + 1} de {slides.length} · {formatTime(s.start)}
          </span>
          <span className="row viewer-actions">
            {onToggle && (
              <label className="viewer-check small">
                <input type="checkbox" checked={selected} onChange={() => onToggle(s.id)} /> Incluir en el PDF
              </label>
            )}
            <button className="ghost small" onClick={onClose} aria-label="Cerrar">
              ✕
            </button>
          </span>
        </div>

        <div className={`viewer-stage ${selected ? '' : 'excluded'}`}>
          <button
            className="viewer-nav prev"
            onClick={() => onNavigate(index - 1)}
            disabled={!hasPrev}
            aria-label="Diapositiva anterior"
          >
            ‹
          </button>
          <img className="viewer-image" src={image.url} alt={`Diapositiva ${index + 1}`} />
          <button
            className="viewer-nav next"
            onClick={() => onNavigate(index + 1)}
            disabled={!hasNext}
            aria-label="Diapositiva siguiente"
          >
            ›
          </button>
        </div>

        {s.variants.length > 1 && (
          <div className="viewer-variants">
            <span className="muted small">Esta diapositiva tiene {s.variants.length} versiones. Elige la que va al PDF:</span>
            <div className="variant-list">
              {s.variants.map((v, i) => (
                <button
                  key={v.url}
                  className={`variant ${i === s.chosen ? 'chosen' : ''}`}
                  onClick={() => onChoose(s.id, i)}
                  aria-pressed={i === s.chosen}
                  aria-label={`Versión ${i + 1}`}
                >
                  <img src={v.url} alt="" />
                  <span>{i === s.chosen ? `Versión ${i + 1} · En el PDF` : `Versión ${i + 1}`}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
