/** Imagen en escala de grises, valores 0..255, fila por fila. */
export interface Gray {
  width: number;
  height: number;
  data: Float32Array;
}

/** Rectángulo en coordenadas normalizadas (0..1) respecto del fotograma. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const FULL_RECT: Rect = { x: 0, y: 0, w: 1, h: 1 };

export function makeGray(width: number, height: number, fill = 0): Gray {
  const data = new Float32Array(width * height);
  if (fill) data.fill(fill);
  return { width, height, data };
}

export function rgbaToGray(rgba: Uint8ClampedArray, width: number, height: number): Gray {
  const out = makeGray(width, height);
  for (let i = 0, j = 0; i < out.data.length; i++, j += 4) {
    out.data[i] = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2];
  }
  return out;
}

/** Redimensiona (promediando áreas) la región `rect` de `g` a w×h. */
export function resize(g: Gray, w: number, h: number, rect: Rect = FULL_RECT): Gray {
  const out = makeGray(w, h);
  const x0 = rect.x * g.width;
  const y0 = rect.y * g.height;
  const sx = (rect.w * g.width) / w;
  const sy = (rect.h * g.height) / h;
  for (let y = 0; y < h; y++) {
    const ya = Math.floor(y0 + y * sy);
    const yb = Math.max(ya + 1, Math.min(g.height, Math.floor(y0 + (y + 1) * sy)));
    for (let x = 0; x < w; x++) {
      const xa = Math.floor(x0 + x * sx);
      const xb = Math.max(xa + 1, Math.min(g.width, Math.floor(x0 + (x + 1) * sx)));
      let sum = 0;
      let n = 0;
      for (let yy = ya; yy < yb; yy++) {
        const row = yy * g.width;
        for (let xx = xa; xx < xb; xx++) {
          sum += g.data[row + xx];
          n++;
        }
      }
      out.data[y * w + x] = n ? sum / n : 0;
    }
  }
  return out;
}

/** Blur de caja separable con radio r. */
export function boxBlur(g: Gray, r = 1): Gray {
  const { width: w, height: h } = g;
  const tmp = new Float32Array(w * h);
  const out = makeGray(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let k = -r; k <= r; k++) {
        const xx = x + k;
        if (xx >= 0 && xx < w) {
          s += g.data[y * w + xx];
          n++;
        }
      }
      tmp[y * w + x] = s / n;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let k = -r; k <= r; k++) {
        const yy = y + k;
        if (yy >= 0 && yy < h) {
          s += tmp[yy * w + x];
          n++;
        }
      }
      out.data[y * w + x] = s / n;
    }
  }
  return out;
}

/** Fracción de píxeles cuya diferencia absoluta supera `threshold`. */
export function changedFraction(a: Gray, b: Gray, threshold = 25): number {
  let n = 0;
  for (let i = 0; i < a.data.length; i++) {
    if (Math.abs(a.data[i] - b.data[i]) > threshold) n++;
  }
  return n / a.data.length;
}

export function stdDev(g: Gray): number {
  let s = 0;
  let s2 = 0;
  for (const v of g.data) {
    s += v;
    s2 += v * v;
  }
  const n = g.data.length;
  const mean = s / n;
  return Math.sqrt(Math.max(0, s2 / n - mean * mean));
}

/** Hash de diferencias de 64 bits (9×8 → 8×8 comparaciones horizontales). */
export function dHash(g: Gray): Uint8Array {
  const small = resize(g, 9, 8);
  const bits = new Uint8Array(64);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits[y * 8 + x] = small.data[y * 9 + x] > small.data[y * 9 + x + 1] ? 1 : 0;
    }
  }
  return bits;
}

export function hamming(a: Uint8Array, b: Uint8Array): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

/** Mapa binario de bordes (magnitud del gradiente > threshold). */
export function edgeMap(g: Gray, threshold = 30): Uint8Array {
  const { width: w, height: h } = g;
  const out = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = g.data[i + 1] - g.data[i - 1];
      const gy = g.data[i + w] - g.data[i - w];
      if (Math.abs(gx) + Math.abs(gy) > threshold) out[i] = 1;
    }
  }
  return out;
}

/**
 * Fracción de los píxeles de borde de `a` (su contenido: texto, líneas) que siguen
 * iguales en `b`. Si es ~1, `b` conserva todo lo de `a` (p. ej. una animación que
 * agrega viñetas); si otra diapo tiene texto distinto en el mismo lugar, baja mucho.
 */
export function preservedFraction(aEdges: Uint8Array, a: Gray, b: Gray, threshold = 25): number {
  let total = 0;
  let kept = 0;
  for (let i = 0; i < aEdges.length; i++) {
    if (!aEdges[i]) continue;
    total++;
    if (Math.abs(a.data[i] - b.data[i]) <= threshold) kept++;
  }
  return total ? kept / total : 1;
}

export function countOnes(m: Uint8Array): number {
  let n = 0;
  for (const v of m) n += v;
  return n;
}

export interface LocalDiff {
  /** Fracción de celdas de la grilla con cambios. */
  changedCells: number;
  /** Grupos conexos de celdas cambiadas. */
  blobs: number;
  /** Fracción de píxeles cambiados fuera de las celdas marcadas. */
  outsideChange: number;
}

/**
 * Compara dos imágenes por zonas (grilla de cols×rows celdas) para saber si la diferencia
 * está concentrada en una región (un menú o algo que tapa la diapo) o repartida por toda
 * la imagen (otra diapositiva).
 */
export function localDifference(a: Gray, b: Gray, threshold = 25, cols = 16, rows = 9): LocalDiff {
  const { width: w, height: h } = a;
  const cellChanged = new Uint8Array(cols * rows);
  const cellCount = new Int32Array(cols * rows);
  const cellTotal = new Int32Array(cols * rows);
  const changed = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const cy = Math.min(rows - 1, Math.floor((y * rows) / h));
    for (let x = 0; x < w; x++) {
      const cx = Math.min(cols - 1, Math.floor((x * cols) / w));
      const i = y * w + x;
      const c = cy * cols + cx;
      cellTotal[c]++;
      if (Math.abs(a.data[i] - b.data[i]) > threshold) {
        changed[i] = 1;
        cellCount[c]++;
      }
    }
  }
  let nChanged = 0;
  for (let c = 0; c < cols * rows; c++) {
    if (cellCount[c] > 0.08 * cellTotal[c]) {
      cellChanged[c] = 1;
      nChanged++;
    }
  }
  // grupos conexos (vecindad 8) de celdas cambiadas
  const seen = new Uint8Array(cols * rows);
  let blobs = 0;
  for (let c = 0; c < cols * rows; c++) {
    if (!cellChanged[c] || seen[c]) continue;
    blobs++;
    const stack = [c];
    seen[c] = 1;
    while (stack.length) {
      const k = stack.pop()!;
      const kx = k % cols;
      const ky = (k - kx) / cols;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = kx + dx;
          const ny = ky + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const n = ny * cols + nx;
          if (cellChanged[n] && !seen[n]) {
            seen[n] = 1;
            stack.push(n);
          }
        }
      }
    }
  }
  let outside = 0;
  let outsideTotal = 0;
  for (let y = 0; y < h; y++) {
    const cy = Math.min(rows - 1, Math.floor((y * rows) / h));
    for (let x = 0; x < w; x++) {
      const cx = Math.min(cols - 1, Math.floor((x * cols) / w));
      if (cellChanged[cy * cols + cx]) continue;
      outsideTotal++;
      outside += changed[y * w + x];
    }
  }
  return {
    changedCells: nChanged / (cols * rows),
    blobs,
    outsideChange: outsideTotal ? outside / outsideTotal : 0,
  };
}

/**
 * ¿La diferencia entre `a` y `b` tiene forma de panel rectangular (un menú, una paleta,
 * una ventana) puesto encima? Busca el rectángulo que encierra los píxeles cambiados y
 * exige que cada lado que no toca el borde de la imagen sea una línea recta marcada en
 * alguna de las dos imágenes. El texto distinto de otra diapositiva no forma esos bordes.
 */
export function isRectangularOverlay(a: Gray, b: Gray, threshold = 25): boolean {
  const { width: w, height: h } = a;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  // filas/columnas con suficientes cambios (ignora píxeles sueltos por compresión)
  const rowCount = new Int32Array(h);
  const colCount = new Int32Array(w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (Math.abs(a.data[y * w + x] - b.data[y * w + x]) > threshold) {
        rowCount[y]++;
        colCount[x]++;
      }
    }
  }
  const minRow = Math.max(2, w * 0.01);
  const minCol = Math.max(2, h * 0.01);
  for (let y = 0; y < h; y++) if (rowCount[y] >= minRow) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  for (let x = 0; x < w; x++) if (colCount[x] >= minCol) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  if (x1 < x0 || y1 < y0) return false;

  const margin = 3;
  // Fracción del lado con un salto de brillo marcado entre adentro y afuera.
  const sideScore = (img: Gray, vertical: boolean, pos: number, from: number, to: number, dir: number) => {
    let best = 0;
    for (let off = -2; off <= 2; off++) {
      const p = pos + off;
      const pin = p - 2 * dir;
      const pout = p + 2 * dir;
      const lim = vertical ? w : h;
      if (pin < 0 || pout < 0 || pin >= lim || pout >= lim) continue;
      let hit = 0;
      let n = 0;
      for (let t = from; t <= to; t++) {
        const vin = vertical ? img.data[t * w + pin] : img.data[pin * w + t];
        const vout = vertical ? img.data[t * w + pout] : img.data[pout * w + t];
        n++;
        if (Math.abs(vin - vout) > 20) hit++;
      }
      if (n) best = Math.max(best, hit / n);
    }
    return best;
  };
  const sides: [boolean, number, number, number, number][] = [];
  if (x0 > margin) sides.push([true, x0, y0, y1, -1]);
  if (x1 < w - 1 - margin) sides.push([true, x1, y0, y1, 1]);
  if (y0 > margin) sides.push([false, y0, x0, x1, -1]);
  if (y1 < h - 1 - margin) sides.push([false, y1, x0, x1, 1]);
  if (!sides.length) return false;
  return sides.every(
    ([vertical, pos, from, to, dir]) =>
      Math.max(sideScore(a, vertical, pos, from, to, dir), sideScore(b, vertical, pos, from, to, dir)) >= 0.6,
  );
}
