const YT_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'];
const ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * Limpia el link del video. Para YouTube devuelve `https://www.youtube.com/watch?v=ID`
 * (sin playlist, tiempo ni parámetros de rastreo). Otras URLs http(s) pasan tal cual,
 * ya que yt-dlp soporta muchos sitios. Si no es una URL, devuelve null.
 */
export function normalizeVideoUrl(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!url.hostname.includes('.')) return null;

  const host = url.hostname.toLowerCase();
  let id: string | null = null;
  if (host === 'youtu.be' || host === 'www.youtu.be') {
    id = url.pathname.split('/')[1] ?? null;
  } else if (YT_HOSTS.includes(host)) {
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'watch') id = url.searchParams.get('v');
    else if (['shorts', 'live', 'embed', 'v'].includes(parts[0])) id = parts[1] ?? null;
  }
  if (id && ID_RE.test(id)) return `https://www.youtube.com/watch?v=${id}`;
  return url.href;
}

export const DRIVES = 'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/** Comando de yt-dlp (Windows) que baja el video en la mejor calidad a la carpeta Descargas del disco elegido. */
export function buildCommand(url: string, drive = 'C'): string {
  const dir = `${drive}:\\Users\\%USERNAME%\\Downloads`;
  return `yt-dlp --no-playlist -f "bv*/b" -P "${dir}" -o "%(title)s.%(ext)s" "${url}"`;
}

export const INSTALL_COMMAND = 'winget install yt-dlp';
