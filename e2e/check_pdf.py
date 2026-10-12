"""Verifica el PDF generado: cantidad de páginas, proporción y que no haya bordes negros
ni restos de la cámara ni del menú que tapaba una diapo. Imprime un JSON con el resultado.

Uso: python3 e2e/check_pdf.py archivo.pdf
"""
import hashlib
import io
import json
import re
import sys

import numpy as np
from PIL import Image
from pypdf import PdfReader

reader = PdfReader(sys.argv[1])
pages = []
for p in reader.pages:
    w, h = float(p.mediabox.width), float(p.mediabox.height)
    # jsPDF comparte los recursos entre páginas: buscamos la imagen que la página dibuja.
    name = re.search(rb"/(\w+) Do", p.get_contents().get_data()).group(1).decode()
    xobj = p["/Resources"]["/XObject"]["/" + name].get_object()
    rgb = np.asarray(Image.open(io.BytesIO(xobj.get_data())).convert("RGB"), dtype=np.float32)
    img = rgb.mean(axis=2)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    magenta = (r > 180) & (g < 80) & (b > 150)
    border = np.concatenate([img[:3].ravel(), img[-3:].ravel(), img[:, :3].ravel(), img[:, -3:].ravel()])
    pages.append({
        "hash": hashlib.md5(img.tobytes()).hexdigest(),
        "ratio": w / h,
        "imgW": img.shape[1],
        "imgH": img.shape[0],
        # fracción de píxeles oscuros en el marco de 3 px (bordes negros mal recortados)
        "darkBorder": float((border < 40).mean()),
        # restos del "menú" magenta que tapaba la diapo
        "magenta": float(magenta.mean()),
    })
print(json.dumps({"pages": pages}))
