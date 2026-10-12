import { Gray, makeGray } from '../src/lib/image';

/** Pseudo-aleatorio determinista. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export function fillRect(g: Gray, x0: number, y0: number, x1: number, y1: number, v: number) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) g.data[y * g.width + x] = v;
}

/**
 * Diapositiva sintética: fondo claro, un título y `nLines` renglones de "palabras"
 * (bloques oscuros de ancho aleatorio). La misma `seed` con menos renglones es la
 * versión parcial de una animación.
 */
export function slide(w: number, h: number, nLines: number, seed = 0): Gray {
  const g = makeGray(w, h, 235);
  const r = rng(seed * 7919 + 13);
  const title = Math.round(w * (0.3 + r() * 0.4));
  fillRect(g, Math.round(w * 0.08), Math.round(h * 0.06), title, Math.round(h * 0.15), 30);
  const lineH = Math.max(2, Math.round(h * 0.04));
  const words: [number, number][][] = [];
  for (let i = 0; i < 6; i++) {
    const row: [number, number][] = [];
    let x = Math.round(w * 0.1);
    const end = Math.round(w * (0.5 + r() * 0.4));
    while (x < end) {
      const len = Math.round(w * (0.02 + r() * 0.07));
      row.push([x, Math.min(end, x + len)]);
      x += len + Math.max(2, Math.round(w * 0.015));
    }
    words.push(row);
  }
  for (let i = 0; i < nLines; i++) {
    const y0 = Math.round(h * (0.24 + i * 0.12));
    for (const [x0, x1] of words[i]) fillRect(g, x0, y0, x1, y0 + lineH, 45);
  }
  return g;
}
