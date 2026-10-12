import { ExtractedSlide } from '../lib/pipeline';
import { formatTime } from '../lib/video';

export function SlideGrid({
  slides,
  onRemove,
}: {
  slides: ExtractedSlide[];
  onRemove?: (id: number) => void;
}) {
  return (
    <ol className="grid" data-testid="slide-grid">
      {slides.map((s, i) => (
        <li key={s.id} className="slide">
          <img src={s.url} alt={`Diapositiva ${i + 1}`} loading="lazy" />
          <div className="slide-meta">
            <span>
              {i + 1} · {formatTime(s.start)}
            </span>
            {onRemove && (
              <button className="ghost small" onClick={() => onRemove(s.id)} aria-label={`Quitar diapositiva ${i + 1}`}>
                Quitar
              </button>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
