import { Gray, Rect, boxBlur } from './image';
import { detectSlideRect, medianImage } from './cropDetect';
import { SlideDetector, DetectorOptions } from './slideDetector';
import { FrameGrabber, canvasToJpeg, cropSize, drawCrop, seek } from './video';

export class CancelledError extends Error {
  constructor() {
    super('Cancelado');
  }
}

function check(signal?: AbortSignal) {
  if (signal?.aborted) throw new CancelledError();
}

const CROP_W = 192;
const CROP_H = 108;
const CROP_PAIRS = 120;
const PAIR_GAP = 0.5;
const REF_FRAMES = 9;

export interface CropResult {
  rect: Rect;
  /** Fotograma representativo (data URL) para mostrar en el editor de recorte. */
  previewUrl: string;
}

/** Primera pasada: muestrea pares de fotogramas por todo el video y detecta el área de la diapositiva. */
export async function detectCrop(
  video: HTMLVideoElement,
  onProgress: (p: number) => void,
  signal?: AbortSignal,
): Promise<CropResult> {
  const grabber = new FrameGrabber();
  const dur = video.duration;
  const nPairs = Math.max(4, Math.min(CROP_PAIRS, Math.floor(dur / 2)));
  const pairs: [Gray, Gray][] = [];
  const refW = Math.min(640, video.videoWidth);
  const refH = Math.round((refW * video.videoHeight) / video.videoWidth);
  const refs: Gray[] = [];
  const refEvery = Math.max(1, Math.floor(nPairs / REF_FRAMES));
  let previewTime = dur / 2;
  let bestStd = -1;

  for (let i = 0; i < nPairs; i++) {
    check(signal);
    const t = ((i + 0.5) / nPairs) * dur;
    await seek(video, t);
    const a = grabber.grab(video, CROP_W, CROP_H);
    if (i % refEvery === 0 && refs.length < REF_FRAMES) refs.push(grabber.grab(video, refW, refH));
    // Elegimos como vista previa el fotograma con más contenido (evita pantallas negras).
    const sd = spread(a);
    if (sd > bestStd) {
      bestStd = sd;
      previewTime = t;
    }
    await seek(video, Math.min(dur, t + PAIR_GAP));
    const b = grabber.grab(video, CROP_W, CROP_H);
    pairs.push([a, b]);
    onProgress((i + 1) / nPairs);
  }

  const ref = refs.length ? medianImage(refs) : undefined;
  const rect = detectSlideRect(pairs, ref);

  await seek(video, previewTime);
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d')!.drawImage(video, 0, 0);
  return { rect, previewUrl: canvas.toDataURL('image/jpeg', 0.85) };
}

function spread(g: Gray): number {
  let s = 0;
  let s2 = 0;
  for (const v of g.data) {
    s += v;
    s2 += v * v;
  }
  const m = s / g.data.length;
  return s2 / g.data.length - m * m;
}

export interface SlideImage {
  blob: Blob;
  url: string;
}

export interface ExtractedSlide {
  id: number;
  start: number;
  end: number;
  /** Versiones de la diapositiva (limpia, con algo encima, animación parcial…). */
  variants: SlideImage[];
  /** Índice de la versión que va al PDF. */
  chosen: number;
  width: number;
  height: number;
}

export function chosenImage(s: ExtractedSlide): SlideImage {
  return s.variants[s.chosen];
}

export interface ExtractCallbacks {
  onProgress: (p: number, time: number) => void;
  onAdd: (s: ExtractedSlide) => void;
  /** Una diapo ya entregada cambió (nueva versión o cambio de versión elegida). */
  onUpdate: (s: ExtractedSlide) => void;
  /** Una versión resultó ser otra diapo: se inserta después de `afterId`. */
  onInsertAfter: (afterId: number, s: ExtractedSlide) => void;
}

const ANALYSIS_W = 256;

/** Segunda pasada: recorre el video con paso fijo y extrae las diapositivas del recorte. */
export async function extractSlides(
  video: HTMLVideoElement,
  rect: Rect,
  step: number,
  detectorOpts: Partial<DetectorOptions>,
  cb: ExtractCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const grabber = new FrameGrabber();
  const detector = new SlideDetector(detectorOpts);
  const { width, height } = cropSize(video, rect);
  const aw = ANALYSIS_W;
  const ah = Math.max(8, Math.round((ANALYSIS_W * height) / width));
  const pending = document.createElement('canvas');
  const dur = video.duration;

  const slides = new Map<number, ExtractedSlide>();
  const encodePending = async (): Promise<SlideImage> => {
    const blob = await canvasToJpeg(pending, 0.9);
    return { blob, url: URL.createObjectURL(blob) };
  };

  const apply = async (d: ReturnType<SlideDetector['finish']>) => {
    if (!d || d.type === 'skip') return;
    if (d.type === 'add') {
      const s: ExtractedSlide = {
        id: d.slide.id,
        start: d.slide.start,
        end: d.slide.end,
        variants: [await encodePending()],
        chosen: 0,
        width: pending.width,
        height: pending.height,
      };
      slides.set(s.id, s);
      cb.onAdd(s);
      return;
    }
    if (d.type === 'split') {
      const from = slides.get(d.from.id);
      if (!from) return;
      const [moved] = from.variants.slice(d.removedIndex, d.removedIndex + 1);
      const rest: ExtractedSlide = {
        ...from,
        variants: from.variants.filter((_, i) => i !== d.removedIndex),
        chosen: d.from.chosen,
      };
      slides.set(rest.id, rest);
      cb.onUpdate(rest);
      URL.revokeObjectURL(moved.url);
      const s: ExtractedSlide = {
        id: d.slide.id,
        start: d.slide.start,
        end: d.slide.end,
        variants: [await encodePending()],
        chosen: 0,
        width: pending.width,
        height: pending.height,
      };
      slides.set(s.id, s);
      cb.onInsertAfter(rest.id, s);
      return;
    }
    const prev = slides.get(d.slide.id);
    if (!prev) return;
    const variants = [...prev.variants];
    if (d.isNew) variants[d.variantIndex] = await encodePending();
    const s: ExtractedSlide = { ...prev, end: d.slide.end, variants, chosen: d.slide.chosen };
    slides.set(s.id, s);
    cb.onUpdate(s);
  };

  const n = Math.max(1, Math.floor(dur / step) + 1);
  for (let i = 0; i < n; i++) {
    check(signal);
    const t = Math.min(i * step, dur);
    await seek(video, t);
    const gray = boxBlur(grabber.grab(video, aw, ah, rect), 1);
    const r = detector.push(t, gray);
    if (r.finalized) await apply(r.finalized);
    if (r.captureCurrent) drawCrop(video, rect, pending);
    cb.onProgress((i + 1) / n, t);
  }
  await apply(detector.finish());
}
