import { Gray, Rect } from './image';

export interface CropOptions {
  /** Luminancia máxima para considerar un píxel "negro". */
  darkLevel: number;
  /** Diferencia mínima entre los dos fotogramas de un par para contar como cambio. */
  changeLevel: number;
  /** Fracción de pares con cambio a partir de la cual un píxel es "dinámico" (cámara). */
  dynamicFreq: number;
  /** Componentes dinámicas más chicas que esta fracción del área se ignoran. */
  minBlobArea: number;
}

export const DEFAULT_CROP_OPTIONS: CropOptions = {
  darkLevel: 28,
  changeLevel: 14,
  dynamicFreq: 0.3,
  minBlobArea: 0.004,
};

interface Box {
  x0: number;
  y0: number;
  x1: number; // exclusivo
  y1: number; // exclusivo
}

/**
 * Recorta filas/columnas negras desde los bordes hacia adentro, usando la luminancia
 * máxima de cada píxel a lo largo del video.
 */
export function trimDarkBorders(maxLum: Gray, darkLevel: number): Box {
  const { width: w, height: h, data } = maxLum;
  const rowDark = (y: number, x0: number, x1: number) => {
    let n = 0;
    for (let x = x0; x < x1; x++) if (data[y * w + x] <= darkLevel) n++;
    return n >= 0.97 * (x1 - x0);
  };
  const colDark = (x: number, y0: number, y1: number) => {
    let n = 0;
    for (let y = y0; y < y1; y++) if (data[y * w + x] <= darkLevel) n++;
    return n >= 0.97 * (y1 - y0);
  };
  const b: Box = { x0: 0, y0: 0, x1: w, y1: h };
  while (b.y0 < b.y1 - 1 && rowDark(b.y0, b.x0, b.x1)) b.y0++;
  while (b.y1 - 1 > b.y0 && rowDark(b.y1 - 1, b.x0, b.x1)) b.y1--;
  while (b.x0 < b.x1 - 1 && colDark(b.x0, b.y0, b.y1)) b.x0++;
  while (b.x1 - 1 > b.x0 && colDark(b.x1 - 1, b.y0, b.y1)) b.x1--;
  // Si todo es negro (video vacío), no recortamos nada.
  if (b.x1 - b.x0 < 2 || b.y1 - b.y0 < 2) return { x0: 0, y0: 0, x1: w, y1: h };
  return b;
}

/**
 * Convierte las zonas dinámicas (cámara) en cajas: cada componente conexa se reemplaza
 * por su rectángulo envolvente, ya que la persona se mueve sólo en parte del recuadro.
 * Devuelve 1 = píxel usable para la diapositiva.
 */
export function buildSlideMask(dynamic: Uint8Array, w: number, h: number, minBlobArea: number): Uint8Array {
  const mask = new Uint8Array(w * h).fill(1);
  const seen = new Uint8Array(w * h);
  const minPixels = Math.max(1, Math.round(minBlobArea * w * h));
  const stack: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (!dynamic[start] || seen[start]) continue;
    let x0 = w, y0 = h, x1 = -1, y1 = -1, count = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w;
      const y = (i - x) / w;
      count++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      // vecindad 8 con un salto de 1 px para unir zonas casi pegadas
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = yy * w + xx;
          if (dynamic[j] && !seen[j]) {
            seen[j] = 1;
            stack.push(j);
          }
        }
      }
    }
    if (count < minPixels) continue;
    for (let y = Math.max(0, y0 - 1); y <= Math.min(h - 1, y1 + 1); y++) {
      for (let x = Math.max(0, x0 - 1); x <= Math.min(w - 1, x1 + 1); x++) mask[y * w + x] = 0;
    }
  }
  return mask;
}

/** Rectángulo de mayor área formado sólo por unos (algoritmo del histograma). */
export function maxRectangle(mask: Uint8Array, w: number, h: number): Box | null {
  const heights = new Int32Array(w);
  let best: Box | null = null;
  let bestArea = 0;
  const stack: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) heights[x] = mask[y * w + x] ? heights[x] + 1 : 0;
    stack.length = 0;
    for (let x = 0; x <= w; x++) {
      const cur = x < w ? heights[x] : 0;
      while (stack.length && heights[stack[stack.length - 1]] >= cur) {
        const top = stack.pop()!;
        const height = heights[top];
        const left = stack.length ? stack[stack.length - 1] + 1 : 0;
        const area = height * (x - left);
        if (area > bestArea) {
          bestArea = area;
          best = { x0: left, y0: y - height + 1, x1: x, y1: y + 1 };
        }
      }
      stack.push(x);
    }
  }
  return best;
}

/**
 * Ajusta cada borde del rectángulo a la línea recta más marcada cercana en una imagen
 * de mayor resolución (borde de la diapositiva contra el fondo o la cámara).
 */
export function refineEdges(rect: Rect, ref: Gray, searchFrac = 0.025): Rect {
  const { width: W, height: H, data } = ref;
  let x0 = Math.round(rect.x * W);
  let x1 = Math.round((rect.x + rect.w) * W);
  let y0 = Math.round(rect.y * H);
  let y1 = Math.round((rect.y + rect.h) * H);
  const rx = Math.max(2, Math.round(searchFrac * W));
  const ry = Math.max(2, Math.round(searchFrac * H));

  // Fuerza de una línea vertical entre las columnas c-1 y c, a lo largo de [ya, yb).
  const vStrength = (c: number, ya: number, yb: number) => {
    if (c <= 0 || c >= W) return 0;
    let s = 0;
    for (let y = ya; y < yb; y++) s += Math.abs(data[y * W + c] - data[y * W + c - 1]);
    return s / Math.max(1, yb - ya);
  };
  const hStrength = (r: number, xa: number, xb: number) => {
    if (r <= 0 || r >= H) return 0;
    let s = 0;
    for (let x = xa; x < xb; x++) s += Math.abs(data[r * W + x] - data[(r - 1) * W + x]);
    return s / Math.max(1, xb - xa);
  };
  const MIN_STRENGTH = 18;
  const best = (center: number, radius: number, lo: number, hi: number, f: (c: number) => number) => {
    let bestC = center;
    let bestS = MIN_STRENGTH;
    for (let c = Math.max(lo, center - radius); c <= Math.min(hi, center + radius); c++) {
      const s = f(c);
      if (s > bestS) {
        bestS = s;
        bestC = c;
      }
    }
    return bestC;
  };
  // Usamos el tramo central de cada borde para no mezclar con las esquinas.
  const midY0 = Math.round(y0 + (y1 - y0) * 0.1);
  const midY1 = Math.round(y1 - (y1 - y0) * 0.1);
  const midX0 = Math.round(x0 + (x1 - x0) * 0.1);
  const midX1 = Math.round(x1 - (x1 - x0) * 0.1);
  const nx0 = best(x0, rx, 0, W, (c) => vStrength(c, midY0, midY1));
  const nx1 = best(x1, rx, 0, W, (c) => vStrength(c, midY0, midY1));
  const ny0 = best(y0, ry, 0, H, (r) => hStrength(r, midX0, midX1));
  const ny1 = best(y1, ry, 0, H, (r) => hStrength(r, midX0, midX1));
  if (nx1 - nx0 > W * 0.1) {
    x0 = nx0;
    x1 = nx1;
  }
  if (ny1 - ny0 > H * 0.1) {
    y0 = ny0;
    y1 = ny1;
  }
  return { x: x0 / W, y: y0 / H, w: (x1 - x0) / W, h: (y1 - y0) / H };
}

/** Mediana por píxel de varias imágenes del mismo tamaño. */
export function medianImage(frames: Gray[]): Gray {
  const { width, height } = frames[0];
  const out = { width, height, data: new Float32Array(width * height) };
  const vals = new Float32Array(frames.length);
  for (let i = 0; i < out.data.length; i++) {
    for (let k = 0; k < frames.length; k++) vals[k] = frames[k].data[i];
    vals.sort();
    out.data[i] = vals[vals.length >> 1];
  }
  return out;
}

/**
 * Detecta la zona de la diapositiva.
 * @param pairs pares de fotogramas (t, t+δ) repartidos por el video, todos del mismo tamaño.
 * @param ref imagen de referencia (mayor resolución) para afinar los bordes; opcional.
 */
export function detectSlideRect(
  pairs: [Gray, Gray][],
  ref?: Gray,
  opts: CropOptions = DEFAULT_CROP_OPTIONS,
): Rect {
  if (!pairs.length) return { x: 0, y: 0, w: 1, h: 1 };
  const { width: w, height: h } = pairs[0][0];
  const n = w * h;
  const maxLum = { width: w, height: h, data: new Float32Array(n) };
  const changes = new Float32Array(n);
  for (const [a, b] of pairs) {
    for (let i = 0; i < n; i++) {
      const va = a.data[i];
      const vb = b.data[i];
      if (va > maxLum.data[i]) maxLum.data[i] = va;
      if (vb > maxLum.data[i]) maxLum.data[i] = vb;
      if (Math.abs(va - vb) > opts.changeLevel) changes[i]++;
    }
  }
  const box = trimDarkBorders(maxLum, opts.darkLevel);
  const bw = box.x1 - box.x0;
  const bh = box.y1 - box.y0;
  const dynamic = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const i = (y + box.y0) * w + (x + box.x0);
      if (changes[i] / pairs.length >= opts.dynamicFreq) dynamic[y * bw + x] = 1;
    }
  }
  const mask = buildSlideMask(dynamic, bw, bh, opts.minBlobArea);
  // Columnas/filas siempre negras dentro de la caja (p. ej. la separación entre la
  // diapositiva y la cámara) tampoco pueden ser parte de la diapositiva.
  const isDark = (x: number, y: number) => maxLum.data[(y + box.y0) * w + (x + box.x0)] <= opts.darkLevel;
  for (let x = 0; x < bw; x++) {
    let n = 0;
    for (let y = 0; y < bh; y++) if (isDark(x, y)) n++;
    if (n >= 0.97 * bh) for (let y = 0; y < bh; y++) mask[y * bw + x] = 0;
  }
  for (let y = 0; y < bh; y++) {
    let n = 0;
    for (let x = 0; x < bw; x++) if (isDark(x, y)) n++;
    if (n >= 0.97 * bw) for (let x = 0; x < bw; x++) mask[y * bw + x] = 0;
  }
  const r = maxRectangle(mask, bw, bh) ?? { x0: 0, y0: 0, x1: bw, y1: bh };
  let rect: Rect = {
    x: (box.x0 + r.x0) / w,
    y: (box.y0 + r.y0) / h,
    w: (r.x1 - r.x0) / w,
    h: (r.y1 - r.y0) / h,
  };
  if (ref) rect = refineEdges(rect, ref, 1.5 / w);
  return clampRect(rect);
}

export function clampRect(r: Rect): Rect {
  const x = Math.min(Math.max(0, r.x), 0.95);
  const y = Math.min(Math.max(0, r.y), 0.95);
  return { x, y, w: Math.min(Math.max(0.05, r.w), 1 - x), h: Math.min(Math.max(0.05, r.h), 1 - y) };
}
