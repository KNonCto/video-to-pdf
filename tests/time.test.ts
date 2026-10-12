import { describe, expect, it } from 'vitest';
import { formatTime, parseTime } from '../src/lib/video';

describe('parseTime', () => {
  it.each([
    ['1:02:03', 3723],
    ['5:12', 312],
    ['90', 90],
    [' 0:07 ', 7],
  ])('%s → %d', (text, sec) => expect(parseTime(text)).toBe(sec));

  it('rechaza texto inválido', () => {
    expect(parseTime('')).toBeNull();
    expect(parseTime('abc')).toBeNull();
    expect(parseTime('1:2:3:4')).toBeNull();
  });

  it('ida y vuelta con formatTime', () => {
    expect(parseTime(formatTime(4321))).toBe(4321);
  });
});
