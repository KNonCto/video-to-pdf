import { describe, expect, it } from 'vitest';
import { Gray, boxBlur } from '../src/lib/image';
import { SlideDetector, Decision } from '../src/lib/slideDetector';
import { fillRect, slide } from './helpers';

const W = 256;
const H = 144;
const A = boxBlur(slide(W, H, 3, 1));
const B = boxBlur(slide(W, H, 2, 2));
const C = boxBlur(slide(W, H, 4, 3));
const BLACK: Gray = { width: W, height: H, data: new Float32Array(W * H) };

function mix(a: Gray, b: Gray, t: number): Gray {
  return { width: W, height: H, data: a.data.map((v, i) => v * (1 - t) + b.data[i] * t) };
}

/** n muestras iguales (1 muestra = 1 s). */
const rep = (g: Gray, n: number): Gray[] => Array(n).fill(g);

/** La diapo con un "menú" que tapa parte del texto (un cuarto de la imagen). */
function covered(seed: number, lines: number): Gray {
  const g = slide(W, H, lines, seed);
  fillRect(g, 100, 30, 228, 102, 120);
  fillRect(g, 110, 40, 218, 60, 200);
  return boxBlur(g);
}

const chosenThumb = (d: SlideDetector, i: number) => d.slides[i].variants[d.slides[i].chosen].thumb;

function run(frames: Gray[], opts = {}) {
  const d = new SlideDetector(opts);
  const decisions: Decision[] = [];
  const captured: number[] = [];
  frames.forEach((f, i) => {
    const r = d.push(i, f);
    if (r.finalized) decisions.push(r.finalized);
    if (r.captureCurrent) captured.push(i);
  });
  const last = d.finish();
  if (last) decisions.push(last);
  return { d, decisions, captured };
}

describe('SlideDetector', () => {
  it('A A (fundido) B B A A C → [A, B, C]', () => {
    const { d, decisions } = run([...rep(A, 15), mix(A, B, 0.5), ...rep(B, 15), ...rep(A, 15), ...rep(C, 15)]);
    expect(d.slides.map((s) => s.start)).toEqual([0, 16, 46]);
    expect(decisions.filter((x) => x.type === 'skip')).toHaveLength(1);
  });

  it('ignora fotogramas de un solo instante y pantallas negras', () => {
    const { d } = run([BLACK, BLACK, BLACK, A, B, ...rep(A, 3)]);
    expect(d.slides).toHaveLength(1);
    expect(d.slides[0].start).toBe(5);
  });

  it('pide capturar el último fotograma estable de cada segmento', () => {
    const { captured } = run([A, A, A, B, B]);
    expect(captured).toEqual([1, 2, 4]);
  });

  it('animación: B ⊃ A deja sólo la diapo completa', () => {
    const partial = boxBlur(slide(W, H, 1, 5));
    const full = boxBlur(slide(W, H, 3, 5));
    const { d, decisions } = run([...rep(partial, 15), ...rep(full, 10)]);
    expect(d.slides).toHaveLength(1);
    expect(decisions.map((x) => x.type)).toEqual(['add', 'variant']);
    expect(chosenThumb(d, 0)).toBe(full);
    // al volver a la versión parcial, se ignora
    const r = run([partial, partial, full, full, partial, partial]);
    expect(r.d.slides).toHaveLength(1);
  });

  it('sin unir animaciones, las guarda por separado', () => {
    const partial = boxBlur(slide(W, H, 1, 5));
    const full = boxBlur(slide(W, H, 3, 5));
    const { d } = run([partial, partial, full, full], { mergeBuilds: false });
    expect(d.slides).toHaveLength(2);
  });
});

describe('SlideDetector con la misma plantilla', () => {
  it('dos diapos distintas con el mismo diseño no se fusionan', () => {
    const s1 = boxBlur(slide(W, H, 3, 11));
    const s2 = boxBlur(slide(W, H, 4, 12));
    const { d } = run([...rep(s1, 15), ...rep(s2, 15)]);
    expect(d.slides).toHaveLength(2);
  });

  it('si la versión "tapada" vuelve a verse mucho rato, era otra diapo y se separa', () => {
    const s1 = boxBlur(slide(W, H, 3, 31));
    const fig = covered(31, 3); // p. ej. la misma diapo con una figura encima
    const { d, decisions } = run([...rep(s1, 40), ...rep(fig, 5), ...rep(BLACK, 3), ...rep(s1, 2), ...rep(fig, 40)]);
    expect(d.slides).toHaveLength(2);
    expect(decisions.some((x) => x.type === 'split')).toBe(true);
    expect(chosenThumb(d, 0)).toBe(s1);
    expect(chosenThumb(d, 1)).toBe(fig);
  });
});

describe('SlideDetector con algo que tapa la diapo', () => {
  const clean = boxBlur(slide(W, H, 3, 21));
  const menu = covered(21, 3);

  it('limpia → tapada un momento → limpia: queda la limpia', () => {
    const { d } = run([...rep(clean, 10), ...rep(menu, 3), ...rep(clean, 10)]);
    expect(d.slides).toHaveLength(1);
    expect(chosenThumb(d, 0)).toBe(clean);
    expect(d.slides[0].variants).toHaveLength(2);
  });

  it('tapada al principio → limpia: se cambia a la limpia', () => {
    const { d, decisions } = run([...rep(menu, 3), ...rep(clean, 20)]);
    expect(d.slides).toHaveLength(1);
    expect(decisions.map((x) => x.type)).toEqual(['add', 'variant']);
    expect(chosenThumb(d, 0)).toBe(clean);
  });

  it('el menú sobre una diapo que luego cambia no se confunde con la siguiente', () => {
    const next = boxBlur(slide(W, H, 2, 22));
    const { d } = run([...rep(clean, 15), ...rep(menu, 3), ...rep(next, 15)]);
    expect(d.slides).toHaveLength(2);
    expect(chosenThumb(d, 0)).toBe(clean);
  });
});
