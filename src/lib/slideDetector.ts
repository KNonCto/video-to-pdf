import { Gray, changedFraction, dHash, edgeMap, preservedFraction, hamming, stdDev, countOnes, localDifference, isRectangularOverlay } from './image';

/** Algo que tapa la diapo (menú, paleta) dura a lo más esto en pantalla (segundos). */
const BRIEF_SECONDS = 8;
/**
 * Una versión más completa (animación) reemplaza a la parcial si se vio al menos esto
 * (segundos). Es bajo a propósito: elegir mal una animación pierde contenido, mientras
 * que un menú sobre una zona vacía sólo ensucia la imagen.
 */
const BUILD_MIN_SECONDS = 3;
/** Si dos versiones duran al menos esto cada una, son diapos distintas (segundos). */
const LONG_SECONDS = 30;
/** Máxima fracción de la diapo que puede cubrir algo que la tapa. */
const MAX_OCCLUSION = 0.5;

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

/** Una versión de una diapositiva (p. ej. limpia, o con un menú encima, o con más viñetas). */
export interface Variant {
  thumb: Gray;
  hash: Uint8Array;
  edges: Uint8Array;
  edgeCount: number;
  /** Segundos en pantalla (sumando todas las veces que apareció). */
  seconds: number;
  firstSeen: number;
  lastSeen: number;
}

export interface SlideInfo {
  id: number;
  start: number;
  end: number;
  variants: Variant[];
  /** Índice de la versión que va al PDF. */
  chosen: number;
}

export type Decision =
  | { type: 'add'; slide: SlideInfo }
  /**
   * Una diapo ya guardada recibió una versión nueva (`isNew`) o cambió la versión elegida.
   * La imagen pendiente corresponde a `variants[variantIndex]`.
   */
  | { type: 'variant'; slide: SlideInfo; variantIndex: number; isNew: boolean }
  /** Una versión resultó ser otra diapo: se saca de `from` y pasa a ser `slide` (con la imagen pendiente). */
  | { type: 'split'; from: SlideInfo; removedIndex: number; slide: SlideInfo }
  | { type: 'skip'; reason: 'duplicate' | 'blank' };

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
  /** Diapo a la que perteneció el último tramo estable (para saber qué es contiguo). */
  private prevSlide: SlideInfo | null = null;
  private lastTime: number | null = null;
  private step = 1;
  private opts: DetectorOptions;

  constructor(opts: Partial<DetectorOptions> = {}) {
    this.opts = { ...DEFAULT_DETECTOR_OPTIONS, ...opts };
    this.opts.minStableSamples = Math.max(2, this.opts.minStableSamples);
  }

  push(time: number, gray: Gray): PushResult {
    if (this.lastTime !== null && time > this.lastTime) this.step = time - this.lastTime;
    this.lastTime = time;
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
    if (stdDev(seg.gray) < o.minStdDev) {
      this.prevSlide = null;
      return { type: 'skip', reason: 'blank' };
    }

    const edges = edgeMap(seg.gray);
    const cand: Variant = {
      thumb: seg.gray,
      hash: dHash(seg.gray),
      edges,
      edgeCount: countOnes(edges),
      seconds: seg.last - seg.start + this.step,
      firstSeen: seg.start,
      lastSeen: seg.last,
    };

    // 1. Igual a una versión ya vista: suma tiempo en pantalla (puede cambiar la elegida).
    for (const s of this.slides) {
      for (let v = 0; v < s.variants.length; v++) {
        const x = s.variants[v];
        if (
          changedFraction(x.thumb, cand.thumb, o.pixelThreshold) > o.dupChangedFraction ||
          hamming(x.hash, cand.hash) > o.dupHashDistance
        ) {
          continue;
        }
        x.seconds += cand.seconds;
        x.lastSeen = cand.lastSeen;
        s.end = Math.max(s.end, cand.lastSeen);
        // Dos versiones que se ven mucho rato cada una (y no son animación) son diapos distintas.
        const cur = s.variants[s.chosen];
        if (
          v !== s.chosen &&
          x.seconds >= LONG_SECONDS &&
          cur.seconds >= LONG_SECONDS &&
          !this.buildRelation(cur, x)
        ) {
          return this.split(s, v);
        }
        this.prevSlide = s;
        const prev = s.chosen;
        s.chosen = this.pick(s);
        if (s.chosen === prev) return { type: 'skip', reason: 'duplicate' };
        return { type: 'variant', slide: s, variantIndex: v, isNew: false };
      }
    }

    // 2. Otra versión de una diapo guardada:
    //    - animación: agrega o quita contenido (se busca en todas las diapos);
    //    - algo que tapa una zona por poco rato (menú, paleta): sólo junto a la diapo contigua.
    for (let k = this.slides.length - 1; k >= 0; k--) {
      const s = this.slides[k];
      const cur = s.variants[s.chosen];
      const build = this.buildRelation(cur, cand);
      if (build && !o.mergeBuilds) continue;
      if (!build && !(s === this.prevSlide && this.isOcclusion(s, cand))) continue;
      s.variants.push(cand);
      s.end = Math.max(s.end, cand.lastSeen);
      s.chosen = this.pick(s);
      this.prevSlide = s;
      return { type: 'variant', slide: s, variantIndex: s.variants.length - 1, isNew: true };
    }

    const slide: SlideInfo = { id: this.nextId++, start: seg.start, end: seg.last, variants: [cand], chosen: 0 };
    this.slides.push(slide);
    this.prevSlide = slide;
    return { type: 'add', slide };
  }

  /** ¿`cand` es la diapo `s` con algo tapando una zona por poco rato (o al revés)? */
  private isOcclusion(s: SlideInfo, cand: Variant): boolean {
    const cur = s.variants[s.chosen];
    const d = localDifference(cur.thumb, cand.thumb, this.opts.pixelThreshold);
    const local = d.changedCells >= 0.02 && d.changedCells <= MAX_OCCLUSION && d.blobs <= 2 && d.outsideChange < 0.005;
    return (
      local &&
      Math.min(cur.seconds, cand.seconds) <= BRIEF_SECONDS &&
      isRectangularOverlay(cur.thumb, cand.thumb, this.opts.pixelThreshold)
    );
  }

  /** Saca la versión `v` de `s` y la convierte en una diapo propia, a continuación de `s`. */
  private split(s: SlideInfo, v: number): Decision {
    const [x] = s.variants.splice(v, 1);
    s.chosen = this.pick(s);
    const slide: SlideInfo = { id: this.nextId++, start: x.firstSeen, end: x.lastSeen, variants: [x], chosen: 0 };
    this.slides.splice(this.slides.indexOf(s) + 1, 0, slide);
    this.prevSlide = slide;
    return { type: 'split', from: s, removedIndex: v, slide };
  }

  /** ¿Una versión contiene a la otra (sólo agrega contenido)? */
  private contains(big: Variant, small: Variant): boolean {
    const t = this.opts.pixelThreshold;
    return (
      big.edgeCount > small.edgeCount * 1.05 &&
      changedFraction(big.thumb, small.thumb, t) <= 0.3 &&
      preservedFraction(small.edges, small.thumb, big.thumb, t) >= 0.93
    );
  }

  private buildRelation(a: Variant, b: Variant): boolean {
    return this.contains(a, b) || this.contains(b, a);
  }

  /**
   * Elige la versión que va al PDF:
   * - una versión parcial que fue reemplazada por otra más completa (que se vio más que
   *   un momento) y no volvió a aparecer queda descartada (animación: gana la completa);
   * - entre las restantes gana la que estuvo más tiempo en pantalla (lo que tapa la
   *   diapo —un menú, una paleta— aparece poco rato y luego se va).
   */
  private pick(s: SlideInfo): number {
    const vs = s.variants;
    let best = -1;
    for (let i = 0; i < vs.length; i++) {
      // (si la versión "más completa" duró apenas un instante, lo más probable es que sea
      // algo que apareció encima —un menú sobre una zona vacía— y no una animación)
      const superseded = vs.some(
        (y, j) =>
          j !== i && y.seconds >= BUILD_MIN_SECONDS && vs[i].lastSeen < y.firstSeen && this.contains(y, vs[i]),
      );
      if (superseded) continue;
      if (best < 0 || vs[i].seconds > vs[best].seconds || (vs[i].seconds === vs[best].seconds && i > best)) best = i;
    }
    return best < 0 ? vs.length - 1 : best;
  }
}
