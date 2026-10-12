import { describe, expect, it } from 'vitest';
import { changedFraction, dHash, hamming, isRectangularOverlay, localDifference, makeGray, resize } from '../src/lib/image';
import { fillRect, slide } from './helpers';

describe('image', () => {
  it('resize promedia áreas', () => {
    const g = makeGray(4, 2);
    g.data.set([0, 0, 100, 100, 0, 0, 100, 100]);
    expect(Array.from(resize(g, 2, 1).data)).toEqual([0, 100]);
  });

  it('dHash: igual para la misma diapo, distinto para otra', () => {
    const a = slide(128, 72, 3, 1);
    const b = slide(128, 72, 2, 7);
    expect(hamming(dHash(a), dHash(a))).toBe(0);
    expect(hamming(dHash(a), dHash(b))).toBeGreaterThan(0);
    expect(changedFraction(a, b)).toBeGreaterThan(0.05);
  });

  it('changedFraction ignora ruido leve', () => {
    const a = slide(64, 36, 2);
    const b = { ...a, data: a.data.map((v, i) => v + ((i % 3) - 1) * 5) };
    expect(changedFraction(a, b)).toBe(0);
  });

  it('localDifference: algo tapando una esquina es un cambio local', () => {
    const a = slide(256, 144, 3, 4);
    const b = slide(256, 144, 3, 4);
    fillRect(b, 160, 90, 256, 144, 120);
    const d = localDifference(a, b);
    expect(d.blobs).toBe(1);
    expect(d.changedCells).toBeGreaterThan(0.05);
    expect(d.changedCells).toBeLessThan(0.3);
    expect(d.outsideChange).toBeLessThan(0.005);
  });

  it('localDifference: una imagen completamente distinta no es local', () => {
    const a = slide(256, 144, 3, 4);
    const b = { ...a, data: a.data.map((v) => 255 - v) };
    expect(localDifference(a, b).changedCells).toBeGreaterThan(0.9);
  });

  it('isRectangularOverlay: un panel encima sí, otra diapo con la misma plantilla no', () => {
    const a = slide(256, 144, 3, 4);
    const panel = slide(256, 144, 3, 4);
    fillRect(panel, 120, 40, 230, 110, 120);
    expect(isRectangularOverlay(a, panel)).toBe(true);
    expect(isRectangularOverlay(a, slide(256, 144, 3, 5))).toBe(false);
    expect(isRectangularOverlay(a, slide(256, 144, 2, 9))).toBe(false);
  });
});
