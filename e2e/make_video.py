"""Genera un video sintético de una "clase" para el test E2E.

1280x720, la diapositiva ocupa x∈[0,960) y∈[90,630) (franjas negras arriba y abajo) y hay
una "cámara" con movimiento a la derecha. Secuencia: S1, S2, S3 parcial → S3 completa
(animación), vuelta a S1, S4, negro. Se esperan 4 diapositivas: S1, S2, S3 completa, S4.

Uso: python3 e2e/make_video.py salida.webm
"""
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

W, H, FPS = 1280, 720, 10
SX0, SY0, SX1, SY1 = 0, 90, 960, 630
CX0, CY0, CX1, CY1 = 980, 250, 1260, 460


def font(size):
    for name in ("DejaVuSans-Bold.ttf", "DejaVuSans.ttf", "LiberationSans-Regular.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default(size)


def slide(title, bullets, bg=(250, 250, 245), accent=(30, 60, 140)):
    img = Image.new("RGB", (SX1 - SX0, SY1 - SY0), bg)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, img.width, 80], fill=accent)
    d.text((30, 18), title, fill=(255, 255, 255), font=font(40))
    for i, b in enumerate(bullets):
        d.text((50, 120 + i * 70), "• " + b, fill=(20, 20, 20), font=font(32))
    return np.asarray(img, dtype=np.float32)


S1 = slide("Introducción", ["Qué es una derivada", "Ejemplos simples", "Notación de Leibniz"])
S2 = slide("Límites", ["Definición épsilon-delta", "Límites laterales"], accent=(140, 40, 40))
S3a = slide("Reglas de derivación", ["Regla de la suma", "Regla del producto"], accent=(30, 110, 60))
S3b = slide("Reglas de derivación", ["Regla de la suma", "Regla del producto", "Regla del cociente", "Regla de la cadena"], accent=(30, 110, 60))
S4 = slide("Ejercicios", ["Derivar x² sin x", "Derivar eˣ / x", "Tarea: guía 3"], accent=(110, 60, 130))
BLACK = np.zeros_like(S1)

# (inicio, fin, diapo)
TIMELINE = [(0, 10, S1), (10, 20, S2), (20, 27, S3a), (27, 35, S3b), (35, 44, S1), (44, 57, S4), (57, 60, BLACK)]
FADE = 0.5


def content_at(t):
    for i, (a, b, s) in enumerate(TIMELINE):
        if a <= t < b:
            if i > 0 and t - a < FADE:
                k = (t - a) / FADE
                return TIMELINE[i - 1][2] * (1 - k) + s * k
            return s
    return TIMELINE[-1][2]


def main(out):
    dur = TIMELINE[-1][1]
    rng = np.random.default_rng(0)
    proc = subprocess.Popen(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
         "-r", str(FPS), "-i", "-", "-c:v", "libvpx-vp9", "-b:v", "1M", "-deadline", "realtime",
         "-cpu-used", "8", "-g", "50", "-pix_fmt", "yuv420p", out],
        stdin=subprocess.PIPE,
    )
    for f in range(int(dur * FPS)):
        t = f / FPS
        frame = np.zeros((H, W, 3), dtype=np.float32)
        frame[SY0:SY1, SX0:SX1] = content_at(t)
        # cámara: fondo, "persona" que se balancea y ruido
        frame[CY0:CY1, CX0:CX1] = (70, 80, 90)
        px = int(CX0 + 90 + 50 * np.sin(t * 2.3))
        py = int(CY0 + 40 + 10 * np.sin(t * 3.1))
        frame[py:CY1, px:px + 100] = (200, 160, 140)
        frame[CY0:CY1, CX0:CX1] += rng.normal(0, 18, (CY1 - CY0, CX1 - CX0, 1))
        proc.stdin.write(np.clip(frame, 0, 255).astype(np.uint8).tobytes())
    proc.stdin.close()
    if proc.wait() != 0:
        sys.exit("ffmpeg falló")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "e2e/fixtures/clase.webm")
