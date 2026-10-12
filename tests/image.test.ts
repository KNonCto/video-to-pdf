import { describe, expect, it } from 'vitest';
import { changedFraction, dHash, hamming, makeGray, resize } from '../src/lib/image';
import { slide } from './helpers';

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
});
