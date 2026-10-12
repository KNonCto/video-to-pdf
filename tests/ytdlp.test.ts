import { describe, expect, it } from 'vitest';
import { buildCommand, normalizeVideoUrl } from '../src/lib/ytdlp';

const CLEAN = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

describe('normalizeVideoUrl', () => {
  it.each([
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123&index=4&t=120s',
    'youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ?si=abcdef',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    'https://www.youtube.com/live/dQw4w9WgXcQ?feature=share',
    'https://www.youtube.com/embed/dQw4w9WgXcQ',
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    '  https://music.youtube.com/watch?v=dQw4w9WgXcQ  ',
  ])('%s', (input) => {
    expect(normalizeVideoUrl(input)).toBe(CLEAN);
  });

  it('otros sitios pasan tal cual', () => {
    expect(normalizeVideoUrl('https://vimeo.com/123456')).toBe('https://vimeo.com/123456');
  });

  it('texto que no es URL', () => {
    expect(normalizeVideoUrl('')).toBeNull();
    expect(normalizeVideoUrl('hola mundo')).toBeNull();
    expect(normalizeVideoUrl('ftp://x.com/a')).toBeNull();
  });
});

describe('buildCommand', () => {
  it('usa Descargas del disco elegido y la mejor calidad', () => {
    expect(buildCommand(CLEAN, 'F')).toBe(
      'yt-dlp --no-playlist -f "bv*/b" -P "F:\\Users\\%USERNAME%\\Downloads" -o "%(title)s.%(ext)s" "https://www.youtube.com/watch?v=dQw4w9WgXcQ"',
    );
  });
});
