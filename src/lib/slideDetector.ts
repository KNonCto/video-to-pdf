import { Gray, changedFraction, dHash, edgeMap, preservedFraction, hamming, stdDev, countOnes } from './image';

export interface DetectorOptions {
  /** Fracción de píxeles cambiados entre muestras para considerar que hubo transición. */
  changeThreshold: number;
  /** Diferencia de nivel de gris para contar un píxel como cambiado. */
  pixelThreshold: number;
  /** Muestras consecutivas casi iguales necesarias para aceptar una diapositiva. */
  minStableSamples: number;
  /** Distancia de Hamming máxima del dHash para considerar dos diapos iguales. */
  dupHashDistance: number;
  /** Fracción de píxeles distintos máxima para considerar dos diapos iguales. */
  dupChangedFraction: number;
  /** Fusionar animaciones (una diapo que sólo agrega contenido reemplaza a la anterior). */
  mergeBuilds: boolean;
  /** Desviación estándar mínima: por debajo es un fotograma vacío (negro/blanco). */
  minStdDev: number;
}

export const DEFAULT_DETECTOR_OPTIONS: DetectorOptions = {
  changeThreshold: 0.02,
  pixelThreshold: 25,
  minStableSamples: 2,
  dupHashDistance: 8,
  dupChangedFraction: 0.03,
  mergeBuilds: true,
  minStdDev: 4,
};

export interface SlideInfo {
  id: number;
  start: number;
  end: number;
  thumb: Gray;
  hash: Uint8Array;
  edges: Uint8Array;
  edgeCount: number;
}

export type Decision =
  | { type: 'add'; slide: SlideInfo }
  | { type: 'replace'; slide: SlideInfo; replacedId: number }
  | { type: 'skip'; reason: 'duplicate' | 'subset' | 'blank' };

export interface PushResult {
  /** El fotograma actual es estable: hay que guardarlo como imagen candidata del segmento. */
  captureCurrent: boolean;
  /** Decisión sobre el segmento que acaba de terminar (se aplica a la imagen guardada antes). */
  finalized?: Decision;
}

interface Segment {
  start: number;
  last: number;
  count: number;
  gray: Gray;
}

/**
 * Máquina de estados que recibe muestras (miniatura en gris del área de la diapositiva)
 * y decide cuándo se terminó una diapositiva, si es nueva, repetida o una animación.
 *
 * Protocolo con quien llama:
 * - `captureCurrent`: guardar la imagen a resolución completa del fotograma actual,
 *   sobrescribiendo la candidata anterior del segmento.
 * - `finalized`: aplica sobre la candidata guardada *antes* de este push (el segmento
 *   anterior). El fotograma actual nunca se pide capturar en el mismo push que cierra
 *   un segmento, así que la candidata guardada sigue siendo la del segmento cerrado.
 */
export class SlideDetector {
  readonly slides: SlideInfo[] = [];
  private seg: Segment | null = null;
  private nextId = 1;
  private opts: DetectorOptions;

  constructor(opts: Partial<DetectorOptions> = {}) {
    this.opts = { ...DEFAULT_DETECTOR_OPTIONS, ...opts };
    this.opts.minStableSamples = Math.max(2, this.opts.minStableSamples);
  }

  push(time: number, gray: Gray): PushResult {
    const seg = this.seg;
    if (seg && changedFraction(seg.gray, gray, this.opts.pixelThreshold) < this.opts.changeThreshold) {
      seg.count++;
      seg.last = time;
      seg.gray = gray;
      return { captureCurrent: seg.count >= this.opts.minStableSamples };
    }
    const finalized = seg ? this.finalize(seg) : undefined;
    this.seg = { start: time, last: time, count: 1, gray };
    return { captureCurrent: false, finalized };
  }

  /** Cierra el último segmento al terminar el video. */
  finish(): Decision | undefined {
    const seg = this.seg;
    this.seg = null;
    return seg ? this.finalize(seg) : undefined;
  }

  private finalize(seg: Segment): Decision | undefined {
    if (seg.count < this.opts.minStableSamples) return undefined;
    const o = this.opts;
    if (stdDev(seg.gray) < o.minStdDev) return { type: 'skip', reason: 'blank' };

    const edges = edgeMap(seg.gray);
    const cand: SlideInfo = {
      id: 0,
      start: seg.start,
      end: seg.last,
      thumb: seg.gray,
      hash: dHash(seg.gray),
      edges,
      edgeCount: countOnes(edges),
    };

    for (const s of this.slides) {
      const frac = changedFraction(s.thumb, cand.thumb, o.pixelThreshold);
      if (frac <= o.dupChangedFraction && hamming(s.hash, cand.hash) <= o.dupHashDistance) {
        return { type: 'skip', reason: 'duplicate' };
      }
    }

    if (o.mergeBuilds) {
      for (let k = this.slides.length - 1; k >= 0; k--) {
        const s = this.slides[k];
        const frac = changedFraction(s.thumb, cand.thumb, o.pixelThreshold);
        if (frac > 0.3) continue;
        // La candidata contiene a la diapo guardada y agrega contenido → es la versión completa.
        if (
          cand.edgeCount > s.edgeCount * 1.05 &&
          preservedFraction(s.edges, s.thumb, cand.thumb, o.pixelThreshold) >= 0.93
        ) {
          const replaced: SlideInfo = { ...cand, id: s.id, start: s.start };
          this.slides[k] = replaced;
          return { type: 'replace', slide: replaced, replacedId: s.id };
        }
        // La candidata es una versión parcial de una diapo ya guardada → se ignora.
        if (
          s.edgeCount > cand.edgeCount * 1.05 &&
          preservedFraction(cand.edges, cand.thumb, s.thumb, o.pixelThreshold) >= 0.93
        ) {
          return { type: 'skip', reason: 'subset' };
        }
      }
    }

    cand.id = this.nextId++;
    this.slides.push(cand);
    return { type: 'add', slide: cand };
  }
}
