#!/usr/bin/env python3
"""Anota las capturas clave del informe (círculos rojos numerados + recuadros),
estilo del manual de referencia. Coordenadas en espacio real 2560x1600.
Lee de raw/, escribe en shots/."""
import os
from PIL import Image, ImageDraw, ImageFont

RAW = "docs/informe-resiliencia/raw"
OUT = "docs/informe-resiliencia/shots"
RED = (220, 38, 38, 255)
os.makedirs(OUT, exist_ok=True)

def font(sz):
    for n in ("arialbd.ttf", "arial.ttf", "DejaVuSans-Bold.ttf"):
        try:
            return ImageFont.truetype(n, sz)
        except OSError:
            continue
    return ImageFont.load_default()

def disc(d, x, y, n, r=30):
    d.ellipse([x - r, y - r, x + r, y + r], fill=RED, outline=(255, 255, 255, 255), width=4)
    f = font(int(r * 1.2))
    t = str(n)
    b = d.textbbox((0, 0), t, font=f)
    d.text((x - (b[2] - b[0]) / 2, y - (b[3] - b[1]) / 2 - b[1]), t, fill=(255, 255, 255, 255), font=f)

# spec: fichero -> lista de figuras
#   ("rect", x, y, w, h)            recuadro rojo
#   ("circ", x, y, r, n)            anillo rojo (radio r) + disco n arriba
#   ("num",  x, y, n)               disco numerado suelto
SPEC = {
    "00_baseline_inicio": [
        ("num", 700, 560, 1), ("num", 1180, 560, 2), ("num", 1730, 560, 3), ("num", 2280, 560, 4),
    ],
    "mesas_01_inicio": [("rect", 1965, 500, 585, 300), ("circ", 2255, 640, 200, 1)],
    "mesas_02_modulo": [("rect", 455, 235, 340, 70), ("circ", 625, 268, 190, 1),
                        ("rect", 1795, 40, 180, 45), ("num", 1885, 62, 2)],
    "pedidos_02": [("rect", 455, 235, 300, 70), ("circ", 605, 268, 170, 1)],
    "caja_01_inicio": [("rect", 1150, 355, 480, 250), ("circ", 1390, 480, 170, 1)],
    "reportes_02": [("rect", 465, 335, 2065, 185), ("circ", 800, 425, 130, 1)],
    "reservas_02": [("circ", 800, 300, 150, 1)],
    "inventario_02": [("rect", 468, 320, 2062, 235), ("num", 570, 435, 1),
                      ("rect", 1550, 715, 200, 60), ("num", 1650, 745, 2)],
    "cuentas_02_caja": [("rect", 2205, 168, 320, 95), ("circ", 2360, 215, 90, 1),
                        ("rect", 475, 350, 320, 90), ("num", 520, 300, 2)],
    "identidad_01_login": [("rect", 1645, 590, 675, 130), ("circ", 1980, 655, 120, 1)],
    "identidad_02_sesion_viva": [("rect", 1645, 590, 675, 130), ("circ", 1980, 655, 120, 1)],
    "kong_01_login": [("rect", 1420, 225, 640, 115), ("circ", 1740, 282, 110, 1)],
    "caja_02": [("rect", 465, 250, 900, 120), ("num", 520, 220, 1)],
    "notificaciones_01_inicio": [("rect", 2130, 40, 90, 60), ("circ", 2175, 70, 70, 1)],
}

for name, shapes in SPEC.items():
    src = os.path.join(RAW, name + ".png")
    if not os.path.exists(src):
        print("MISS", src); continue
    im = Image.open(src).convert("RGBA")
    ov = Image.new("RGBA", im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    for fig in shapes:
        k = fig[0]
        if k == "rect":
            _, x, y, w, h = fig
            for i in range(6):
                d.rounded_rectangle([x - i, y - i, x + w + i, y + h + i], radius=16, outline=RED)
        elif k == "circ":
            _, x, y, r, n = fig
            for i in range(6):
                d.ellipse([x - r - i, y - r - i, x + r + i, y + r + i], outline=RED)
            disc(d, x, y - r - 40, n)
        elif k == "num":
            _, x, y, n = fig
            disc(d, x, y, n)
    Image.alpha_composite(im, ov).convert("RGB").save(os.path.join(OUT, name + ".png"), quality=95)
    print("OK", name)
