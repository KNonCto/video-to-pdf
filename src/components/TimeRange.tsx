import { useEffect, useState } from 'react';
import { formatTime, parseTime } from '../lib/video';

/**
 * Línea de tiempo con dos manillas para elegir el tramo del video a analizar.
 * Al mover una manilla se llama a `onPreview` con ese instante, para mostrar el fotograma.
 */
export function TimeRange({
  duration,
  start,
  end,
  onChange,
  onPreview,
}: {
  duration: number;
  start: number;
  end: number;
  onChange: (start: number, end: number) => void;
  onPreview: (t: number) => void;
}) {
  const minGap = Math.min(5, duration / 10);
  const setStart = (v: number) => {
    const s = Math.max(0, Math.min(v, end - minGap));
    onChange(s, end);
    onPreview(s);
  };
  const setEnd = (v: number) => {
    const e = Math.min(duration, Math.max(v, start + minGap));
    onChange(start, e);
    onPreview(e);
  };
  const pct = (v: number) => `${(v / duration) * 100}%`;

  return (
    <div className="timerange">
      <div className="timerange-track">
        <div className="timerange-fill" style={{ left: pct(start), width: pct(end - start) }} />
        <input
          type="range"
          min={0}
          max={duration}
          step={1}
          value={start}
          aria-label="Inicio del tramo"
          onChange={(e) => setStart(Number(e.target.value))}
        />
        <input
          type="range"
          min={0}
          max={duration}
          step={1}
          value={end}
          aria-label="Fin del tramo"
          onChange={(e) => setEnd(Number(e.target.value))}
        />
      </div>
      <div className="timerange-fields">
        <TimeField label="Desde" value={start} onCommit={setStart} />
        <span className="muted small">
          {formatTime(end - start)} de {formatTime(duration)}
        </span>
        <TimeField label="Hasta" value={end} onCommit={setEnd} />
      </div>
    </div>
  );
}

function TimeField({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number) => void }) {
  const [text, setText] = useState(formatTime(value));
  useEffect(() => setText(formatTime(value)), [value]);
  const commit = () => {
    const t = parseTime(text);
    if (t === null) setText(formatTime(value));
    else onCommit(t);
  };
  return (
    <label className="timefield">
      {label}{' '}
      <input
        className="text-input"
        value={text}
        aria-label={label}
        inputMode="numeric"
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
      />
    </label>
  );
}
