import { Gray, Rect, rgbaToGray } from './image';

export async function loadVideo(file: File | Blob): Promise<{ video: HTMLVideoElement; url: string }> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () =>
      reject(new Error('El navegador no puede leer este video. Prueba con un MP4 (H.264) o WebM.'));
  });
  if (!video.videoWidth || !Number.isFinite(video.duration)) {
    throw new Error('No se pudo leer la duración o el tamaño del video.');
  }
  return { video, url };
}

/** Salta a `t` segundos y espera a que el fotograma esté disponible. */
export function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const target = Math.min(Math.max(0, t), Math.max(0, video.duration - 0.05));
    if (Math.abs(video.currentTime - target) < 1e-3 && video.readyState >= 2) {
      resolve();
      return;
    }
    const done = () => {
      clearTimeout(timer);
      video.removeEventListener('seeked', done);
      resolve();
    };
    // Por si algún navegador no dispara 'seeked' (fotograma corrupto, etc.)
    const timer = setTimeout(done, 5000);
    video.addEventListener('seeked', done);
    video.currentTime = target;
  });
}

/** Dibuja la región `rect` (normalizada) del fotograma actual y la devuelve en gris w×h. */
export class FrameGrabber {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
  }

  grab(video: HTMLVideoElement, w: number, h: number, rect: Rect = { x: 0, y: 0, w: 1, h: 1 }): Gray {
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'medium';
    this.ctx.drawImage(video, rect.x * vw, rect.y * vh, rect.w * vw, rect.h * vh, 0, 0, w, h);
    return rgbaToGray(this.ctx.getImageData(0, 0, w, h).data, w, h);
  }
}

/** Tamaño en píxeles reales del recorte. */
export function cropSize(video: HTMLVideoElement, rect: Rect): { width: number; height: number } {
  return {
    width: Math.max(1, Math.round(rect.w * video.videoWidth)),
    height: Math.max(1, Math.round(rect.h * video.videoHeight)),
  };
}

export function drawCrop(video: HTMLVideoElement, rect: Rect, canvas: HTMLCanvasElement): void {
  const { width, height } = cropSize(video, rect);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(
    video,
    rect.x * video.videoWidth,
    rect.y * video.videoHeight,
    width,
    height,
    0,
    0,
    width,
    height,
  );
}

export function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo codificar la imagen'))), 'image/jpeg', quality),
  );
}

export function formatTime(sec: number): string {
  const s = Math.floor(sec % 60);
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor(sec / 3600);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
