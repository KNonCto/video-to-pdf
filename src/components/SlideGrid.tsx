import { ExtractedSlide, chosenImage } from '../lib/pipeline';
import { formatTime } from '../lib/video';

export function SlideGrid({
  slides,
  onRemove,
  onCycle,
}: {
  slides: ExtractedSlide[];
  onRemove?: (id: number) => void;
  onCycle?: (id: number) => void;
}) {
  return (
    <ol className="grid" data-testid="slide-grid">
      {slides.map((s, i) => (
        <li key={s.id} className="slide">
          <img src={chosenImage(s).url} alt={`Diapositiva ${i + 1}`} loading="lazy" />
          <div className="slide-meta">
            <span>
              {i + 1} · {formatTime(s.start)}
            </span>
            <span className="row slide-actions">
              {onCycle && s.variants.length > 1 && (
                <button
                  className="ghost small"
                  onClick={() => onCycle(s.id)}
                  title="Cambiar a otra versión de esta diapositiva (p. ej. sin un menú encima)"
                >
                  Versión {s.chosen + 1}/{s.variants.length}
                </button>
              )}
              {onRemove && (
                <button className="ghost small" onClick={() => onRemove(s.id)} aria-label={`Quitar diapositiva ${i + 1}`}>
                  Quitar
                </button>
              )}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}
