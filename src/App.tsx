import { useEffect, useRef, useState } from 'react';
import { FileDrop } from './components/FileDrop';
import { CropEditor } from './components/CropEditor';
import { SlideGrid } from './components/SlideGrid';
import { Rect } from './lib/image';
import { loadVideo, formatTime } from './lib/video';
import { CancelledError, ExtractedSlide, detectCrop, extractSlides } from './lib/pipeline';

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
      prev.forEach((s) => URL.revokeObjectURL(s.url));
      return [];
    });
    setStage('idle');
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
        step,
        { mergeBuilds },
        {
          onProgress: (p, t) => {
            setProgress(p);
            setProgressTime(t);
          },
          onAdd: (s) => setSlides((prev) => [...prev, s]),
          onReplace: (id, s) =>
            setSlides((prev) =>
              prev.map((x) => {
                if (x.id !== id) return x;
                URL.revokeObjectURL(x.url);
                return s;
              }),
            ),
        },
        ctrl.signal,
      );
      setStage('review');
    } catch (e) {
      if (e instanceof CancelledError) setStage('review');
      else handleError(e);
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
      const blob = await buildPdf(slides);
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

  function removeSlide(id: number) {
    setSlides((prev) => {
      const s = prev.find((x) => x.id === id);
      if (s) URL.revokeObjectURL(s.url);
      return prev.filter((x) => x.id !== id);
    });
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
            Minuto {formatTime(progressTime)} de {formatTime(video.current?.video.duration ?? 0)} {eta && `· ${eta}`}
          </p>
          <div className="row">
            <button className="ghost" onClick={() => abort.current?.abort()}>
              Detener y usar lo encontrado
            </button>
          </div>
          <SlideGrid slides={slides} />
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
          <SlideGrid slides={slides} onRemove={removeSlide} />
        </section>
      )}

      <footer className="muted small">Todo se procesa localmente en tu navegador.</footer>
    </main>
  );
}

function Progress({ value }: { value: number }) {
  return (
    <div className="progress" role="progressbar" aria-valuenow={Math.round(value * 100)}>
      <div style={{ width: `${value * 100}%` }} />
    </div>
  );
}
