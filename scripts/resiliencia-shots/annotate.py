#!/usr/bin/env python3
"""Anota capturas al estilo del manual de referencia: recuadros rojos y
círculos rojos numerados sobre coordenadas exactas.

Uso:
  python annotate.py IN.png OUT.png "SPEC"
SPEC es una lista separada por ';' de figuras:
  rect:x,y,w,h            -> recuadro rojo
  circ:x,y,r,N            -> círculo rojo con número N centrado
  num:x,y,N               -> solo un disco numerado (r=26)
Coordenadas en el espacio real del PNG (2560x1600 para el harness).
"""
import sys
from PIL import Image, ImageDraw, ImageFont

RED = (220, 38, 38, 255)

def font(sz):
    for name in ("arialbd.ttf", "arial.ttf", "DejaVuSans-Bold.ttf"):
        try:
            return ImageFont.truetype(name, sz)
        except OSError:
            continue
    return ImageFont.load_default()

def disc(draw, x, y, r, n):
    draw.ellipse([x - r, y - r, x + r, y + r], fill=RED, outline=(255, 255, 255, 255), width=3)
    f = font(int(r * 1.15))
    t = str(n)
    b = draw.textbbox((0, 0), t, font=f)
    draw.text((x - (b[2] - b[0]) / 2, y - (b[3] - b[1]) / 2 - b[1]), t, fill=(255, 255, 255, 255), font=f)

def main():
    inp, outp, spec = sys.argv[1], sys.argv[2], sys.argv[3]
    im = Image.open(inp).convert("RGBA")
    ov = Image.new("RGBA", im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    for part in spec.split(";"):
        part = part.strip()
        if not part:
            continue
        kind, rest = part.split(":", 1)
        a = [int(float(v)) for v in rest.split(",")]
        if kind == "rect":
            x, y, w, h = a
            for i in range(5):  # grosor
                d.rounded_rectangle([x - i, y - i, x + w + i, y + h + i], radius=14, outline=RED)
        elif kind == "circ":
            x, y, r, n = a
            for i in range(5):
                d.ellipse([x - r - i, y - r - i, x + r + i, y + r + i], outline=RED)
            disc(d, x, y - r - 34, 26, n)
        elif kind == "num":
            x, y, n = a
            disc(d, x, y, 26, n)
    Image.alpha_composite(im, ov).convert("RGB").save(outp, quality=95)
    print("wrote", outp)

if __name__ == "__main__":
    main()
