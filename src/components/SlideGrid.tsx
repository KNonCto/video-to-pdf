import { ExtractedSlide, chosenImage } from '../lib/pipeline';
import { formatTime } from '../lib/video';

export function SlideGrid({
  slides,
  excluded,
  onToggle,
  onCycle,
  onOpen,
}: {
  slides: ExtractedSlide[];
  excluded?: Set<number>;
  onToggle?: (id: number) => void;
  onCycle?: (id: number) => void;
  onOpen?: (index: number) => void;
}) {
  return (
    <ol className="grid" data-testid="slide-grid">
      {slides.map((s, i) => {
        const selected = !excluded?.has(s.id);
        return (
          <li key={s.id} className={`slide ${selected ? '' : 'excluded'}`}>
            <button
              className="slide-open"
              onClick={() => onOpen?.(i)}
              disabled={!onOpen}
              aria-label={`Ver diapositiva ${i + 1}`}
            >
              <img src={chosenImage(s).url} alt={`Diapositiva ${i + 1}`} loading="lazy" />
            </button>
            {onToggle && (
              <label className="slide-check" title={selected ? 'Va en el PDF' : 'No va en el PDF'}>
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onToggle(s.id)}
                  aria-label={`Incluir diapositiva ${i + 1} en el PDF`}
                />
              </label>
            )}
            <div className="slide-meta">
              <span>
                {i + 1} · {formatTime(s.start)}
              </span>
              {onCycle && s.variants.length > 1 && (
                <button
                  className="ghost small"
                  onClick={() => onCycle(s.id)}
                  title="Cambiar a otra versión de esta diapositiva (p. ej. sin un menú encima)"
                >
                  Versión {s.chosen + 1}/{s.variants.length}
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
