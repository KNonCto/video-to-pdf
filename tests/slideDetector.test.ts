import { describe, expect, it } from 'vitest';
import { Gray, boxBlur } from '../src/lib/image';
import { SlideDetector, Decision } from '../src/lib/slideDetector';
import { slide } from './helpers';

const W = 256;
const H = 144;
const A = boxBlur(slide(W, H, 3, 1));
const B = boxBlur(slide(W, H, 2, 2));
const C = boxBlur(slide(W, H, 4, 3));
const BLACK: Gray = { width: W, height: H, data: new Float32Array(W * H) };

function mix(a: Gray, b: Gray, t: number): Gray {
  return { width: W, height: H, data: a.data.map((v, i) => v * (1 - t) + b.data[i] * t) };
}

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
    const { d, decisions } = run([A, A, A, mix(A, B, 0.5), B, B, B, A, A, A, C, C]);
    expect(d.slides.map((s) => s.start)).toEqual([0, 4, 10]);
    expect(decisions.filter((x) => x.type === 'skip')).toHaveLength(1);
  });

  it('ignora fotogramas de un solo instante y pantallas negras', () => {
    const { d } = run([BLACK, BLACK, BLACK, A, B, A, A, A]);
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
    const { d, decisions } = run([partial, partial, partial, full, full, full]);
    expect(d.slides).toHaveLength(1);
    expect(decisions.map((x) => x.type)).toEqual(['add', 'replace']);
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
    const { d } = run([s1, s1, s1, s2, s2, s2]);
    expect(d.slides).toHaveLength(2);
  });
});
