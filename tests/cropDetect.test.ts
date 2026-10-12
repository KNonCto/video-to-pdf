import { describe, expect, it } from 'vitest';
import { Gray, makeGray } from '../src/lib/image';
import { detectSlideRect, maxRectangle, trimDarkBorders } from '../src/lib/cropDetect';
import { fillRect, rng, slide } from './helpers';

const W = 192;
const H = 108;

/** Fotograma: letterbox negro, diapo en [x0,x1)×[y0,y1) y una "cámara" ruidosa opcional. */
function frame(content: Gray, box: number[], cam: number[] | null, noise: () => number, amp: number): Gray {
  const g = makeGray(W, H, 5);
  const [x0, y0, x1, y1] = box;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const sx = Math.floor(((x - x0) / (x1 - x0)) * content.width);
      const sy = Math.floor(((y - y0) / (y1 - y0)) * content.height);
      g.data[y * W + x] = content.data[sy * content.width + sx];
    }
  }
  if (cam) {
    const [cx0, cy0, cx1, cy1] = cam;
    fillRect(g, cx0, cy0, cx1, cy1, 90);
    // persona que se mueve: una mancha que cambia de lugar + ruido
    const px = cx0 + Math.floor(noise() * (cx1 - cx0 - 10));
    fillRect(g, px, cy0 + 4, px + 10, cy1, 180);
    for (let y = cy0; y < cy1; y++) for (let x = cx0; x < cx1; x++) g.data[y * W + x] += (noise() - 0.5) * amp;
  }
  return g;
}

function makePairs(box: number[], cam: number[] | null, amp = 60): [Gray, Gray][] {
  const noise = rng(42);
  const slides = [0, 1, 2, 3, 4].map((i) => slide(128, 72, 2 + (i % 3), i));
  const pairs: [Gray, Gray][] = [];
  for (let i = 0; i < 60; i++) {
    const s = slides[Math.floor(i / 12)];
    // una transición dentro del par de vez en cuando
    const s2 = i % 12 === 11 ? slides[Math.min(4, Math.floor(i / 12) + 1)] : s;
    pairs.push([frame(s, box, cam, noise, amp), frame(s2, box, cam, noise, amp)]);
  }
  return pairs;
}

const near = (a: number, b: number, tol = 0.02) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

describe('cropDetect', () => {
  it('trimDarkBorders recorta el letterbox', () => {
    const g = makeGray(W, H, 0);
    fillRect(g, 20, 10, 170, 100, 200);
    expect(trimDarkBorders(g, 28)).toEqual({ x0: 20, y0: 10, x1: 170, y1: 100 });
  });

  it('maxRectangle evita la esquina ocupada', () => {
    const w = 10;
    const h = 6;
    const m = new Uint8Array(w * h).fill(1);
    for (let y = 0; y < 3; y++) for (let x = 7; x < 10; x++) m[y * w + x] = 0;
    expect(maxRectangle(m, w, h)).toEqual({ x0: 0, y0: 0, x1: 7, y1: 6 });
  });

  it('sólo bordes negros', () => {
    const box = [16, 6, 176, 96];
    const r = detectSlideRect(makePairs(box, null));
    near(r.x, 16 / W);
    near(r.y, 6 / H);
    near(r.x + r.w, 176 / W);
    near(r.y + r.h, 96 / H);
  });

  it('diapo a la izquierda y cámara a la derecha', () => {
    const box = [0, 14, 140, 94];
    const cam = [144, 30, 192, 78];
    const r = detectSlideRect(makePairs(box, cam));
    near(r.x, 0);
    near(r.y, 14 / H);
    near(r.x + r.w, 140 / W, 0.03);
    near(r.y + r.h, 94 / H);
  });

  it('cámara superpuesta en una esquina de la diapo: el recorte no la incluye', () => {
    const box = [0, 0, W, H];
    const cam = [150, 70, 192, 108];
    const r = detectSlideRect(makePairs(box, cam));
    const camInside = r.x + r.w > 150 / W && r.y + r.h > 70 / H;
    expect(camInside).toBe(false);
    expect(r.w * r.h).toBeGreaterThan(0.6);
  });

  it('cámara con fondo quieto separada por una franja negra', () => {
    const box = [0, 14, 140, 94];
    const cam = [150, 30, 192, 78];
    const r = detectSlideRect(makePairs(box, cam, 0));
    near(r.x + r.w, 140 / W);
    near(r.y, 14 / H);
    near(r.y + r.h, 94 / H);
  });
});
