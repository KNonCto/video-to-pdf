import { useCallback, useEffect, useRef, useState } from 'react';
import { FileDrop } from './components/FileDrop';
import { CropEditor } from './components/CropEditor';
import { SlideGrid } from './components/SlideGrid';
import { LivePreview } from './components/LivePreview';
import { SlideViewer } from './components/SlideViewer';
import { TimeRange } from './components/TimeRange';
import { Rect } from './lib/image';
import { loadVideo, formatTime, frameDataUrl, seek } from './lib/video';
import { CancelledError, ExtractedSlide, chosenImage, detectCrop, extractSlides } from './lib/pipeline';

type Stage = 'idle' | 'detecting' | 'crop' | 'analyzing' | 'review';

const STEPS = [0.5, 1, 2, 3];

export default function App() {
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [progress, setProgress] = useState(0);
  const [progressTime, setProgressTime] = useState(0);
  const [rect, setRect] = useState<Rect>({ x: 0, y: 0, w: 1, h: 1 });
  const [preview, setPreview] = useState('');
  const [slides, setSlides] = useState<ExtractedSlide[]>([]);
  const [step, setStep] = useState(1);
  const [mergeBuilds, setMergeBuilds] = useState(true);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [range, setRange] = useState({ start: 0, end: 0 });
  const previewBusy = useRef(false);
  const previewWanted = useRef<number | null>(null);

  const video = useRef<{ video: HTMLVideoElement; url: string } | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => reset(), []);

  function reset() {
    abort.current?.abort();
    if (video.current) {
      URL.revokeObjectURL(video.current.url);
      video.current.video.removeAttribute('src');
      video.current = null;
    }
    setSlides((prev) => {
      prev.forEach(revokeSlide);
      return [];
    });
    setStage('idle');
    setViewerIndex(null);
    setProgress(0);
    setPreview('');
  }

  async function onFile(file: File) {
    reset();
    setError(null);
    setFileName(file.name.replace(/\.[^.]+$/, ''));
    try {
      video.current = await loadVideo(file);
      setStage('detecting');
      setProgress(0);
      const ctrl = new AbortController();
      abort.current = ctrl;
      const res = await detectCrop(video.current.video, setProgress, ctrl.signal);
      setRect(res.rect);
      setPreview(res.previewUrl);
      setRange({ start: 0, end: video.current.video.duration });
      setStage('crop');
    } catch (e) {
      handleError(e);
    }
  }

  async function analyze() {
    if (!video.current) return;
    setStage('analyzing');
    setProgress(0);
    setStartedAt(performance.now());
    setSlides([]);
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      await extractSlides(
        video.current.video,
        rect,
        range,
        step,
        { mergeBuilds },
        {
          onProgress: (p, t) => {
            setProgress(p);
            setProgressTime(t);
          },
          onAdd: (s) => setSlides((prev) => [...prev, s]),
          onUpdate: (s) => setSlides((prev) => prev.map((x) => (x.id === s.id ? s : x))),
          onInsertAfter: (afterId, s) =>
            setSlides((prev) => {
              const i = prev.findIndex((x) => x.id === afterId);
              return i < 0 ? [...prev, s] : [...prev.slice(0, i + 1), s, ...prev.slice(i + 1)];
            }),
        },
        ctrl.signal,
      );
      setStage('review');
    } catch (e) {
      if (e instanceof CancelledError) setStage('review');
      else handleError(e);
    }
  }

  /** Muestra en el editor el fotograma del instante `t` (sin acumular saltos si se arrastra rápido). */
  async function showFrameAt(t: number) {
    const v = video.current?.video;
    if (!v) return;
    previewWanted.current = t;
    if (previewBusy.current) return;
    previewBusy.current = true;
    try {
      while (previewWanted.current !== null) {
        const target = previewWanted.current;
        previewWanted.current = null;
        await seek(v, target);
        setPreview(frameDataUrl(v, 0.8));
      }
    } finally {
      previewBusy.current = false;
    }
  }

  function handleError(e: unknown) {
    if (e instanceof CancelledError) return;
    setError(e instanceof Error ? e.message : String(e));
    setStage('idle');
  }

  async function downloadPdf() {
    setPdfBusy(true);
    try {
      const { buildPdf } = await import('./lib/pdf');
      const blob = await buildPdf(slides.map((s) => ({ blob: chosenImage(s).blob, width: s.width, height: s.height })));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileName || 'diapositivas'}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPdfBusy(false);
    }
  }

  const chooseVariant = useCallback((id: number, variantIndex: number) => {
    setSlides((prev) => prev.map((s) => (s.id === id ? { ...s, chosen: variantIndex } : s)));
  }, []);

  function cycleVariant(id: number) {
    const s = slides.find((x) => x.id === id);
    if (s) chooseVariant(id, (s.chosen + 1) % s.variants.length);
  }

  const closeViewer = useCallback(() => setViewerIndex(null), []);

  function removeSlide(id: number) {
    const s = slides.find((x) => x.id === id);
    if (s) revokeSlide(s);
    const rest = slides.filter((x) => x.id !== id);
    setSlides(rest);
    if (viewerIndex !== null) setViewerIndex(rest.length ? Math.min(viewerIndex, rest.length - 1) : null);
  }

  const eta = (() => {
    if (stage !== 'analyzing' || progress < 0.02) return '';
    const elapsed = (performance.now() - startedAt) / 1000;
    return `quedan ~${formatTime((elapsed / progress) * (1 - progress))}`;
  })();

  return (
    <main>
      <header>
        <h1>Video a PDF de diapositivas</h1>
        <p className="muted">
          Saca las diapositivas de la grabación de una clase: recorta bordes y cámara, y omite las repetidas.
        </p>
      </header>

      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}

      {stage === 'idle' && <FileDrop onFile={onFile} />}

      {stage === 'detecting' && (
        <section className="stack">
          <h2>Buscando dónde está la diapositiva…</h2>
          <Progress value={progress} />
          <button className="ghost" onClick={reset}>
            Cancelar
          </button>
        </section>
      )}

      {stage === 'crop' && (
        <section className="stack">
          <h2>Revisa el recorte</h2>
          <p className="muted">
            El recuadro azul es lo que se guardará de cada diapositiva. Arrástralo o mueve sus bordes si hace falta.
          </p>
          <CropEditor imageUrl={preview} rect={rect} onChange={setRect} />
          <div className="stack tight">
            <h3>¿Desde dónde hasta dónde?</h3>
            <p className="muted small">
              Deja fuera el principio y el final si ahí se ven las cámaras de la gente en vez de diapositivas. Al mover
              una manilla, la imagen de arriba muestra ese momento del video.
            </p>
            <TimeRange
              duration={video.current?.video.duration ?? 0}
              start={range.start}
              end={range.end}
              onChange={(start, end) => setRange({ start, end })}
              onPreview={showFrameAt}
            />
          </div>
          <div className="options">
            <label>
              Revisar cada{' '}
              <select value={step} onChange={(e) => setStep(Number(e.target.value))}>
                {STEPS.map((s) => (
                  <option key={s} value={s}>
                    {s} s
                  </option>
                ))}
              </select>
            </label>
            <label>
              <input type="checkbox" checked={mergeBuilds} onChange={(e) => setMergeBuilds(e.target.checked)} /> Unir
              animaciones (guardar sólo la diapo completa)
            </label>
          </div>
          <div className="row">
            <button className="ghost" onClick={reset}>
              Elegir otro video
            </button>
            <button className="primary" onClick={analyze}>
              Extraer diapositivas
            </button>
          </div>
        </section>
      )}

      {stage === 'analyzing' && (
        <section className="stack">
          <h2>
            Extrayendo diapositivas… {slides.length} encontradas
          </h2>
          <Progress value={progress} />
          <p className="muted small">
            Minuto {formatTime(progressTime)} de {formatTime(range.end)} {eta && `· ${eta}`}
          </p>
          <div className="row">
            <button className="ghost" onClick={() => abort.current?.abort()}>
              Detener y usar lo encontrado
            </button>
          </div>
          {video.current && <LivePreview video={video.current.video} rect={rect} captured={slides.length} />}
          <SlideGrid slides={slides} onOpen={setViewerIndex} />
        </section>
      )}

      {stage === 'review' && (
        <section className="stack">
          <h2 data-testid="result-title">{slides.length} diapositivas</h2>
          <div className="row">
            <button className="ghost" onClick={reset}>
              Empezar de nuevo
            </button>
            <button className="ghost" onClick={() => setStage('crop')} disabled={!video.current}>
              Cambiar recorte
            </button>
            <button className="primary" onClick={downloadPdf} disabled={!slides.length || pdfBusy}>
              {pdfBusy ? 'Generando…' : 'Descargar PDF'}
            </button>
          </div>
          <SlideGrid slides={slides} onRemove={removeSlide} onCycle={cycleVariant} onOpen={setViewerIndex} />
        </section>
      )}

      {viewerIndex !== null && slides[viewerIndex] && (stage === 'analyzing' || stage === 'review') && (
        <SlideViewer
          slides={slides}
          index={viewerIndex}
          onClose={closeViewer}
          onNavigate={setViewerIndex}
          onChoose={chooseVariant}
          onRemove={stage === 'review' ? removeSlide : undefined}
        />
      )}

      <footer className="muted small">Todo se procesa localmente en tu navegador.</footer>
    </main>
  );
}

function revokeSlide(s: ExtractedSlide) {
  s.variants.forEach((v) => URL.revokeObjectURL(v.url));
}

function Progress({ value }: { value: number }) {
  return (
    <div className="progress" role="progressbar" aria-valuenow={Math.round(value * 100)}>
      <div style={{ width: `${value * 100}%` }} />
    </div>
  );
}
