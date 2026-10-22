#!/usr/bin/env python3
"""Draw the original Planos Santo paint cursors (Hito 2, PINTURA-12).
Own design: a small crosshair at the hotspot (3,3) and one badge per mode.
Requires Pillow; no external assets. Run: python3 scripts/generate-paint-cursors.py
"""
from pathlib import Path
from PIL import Image, ImageDraw

DEST = Path(__file__).resolve().parents[1] / 'sketchup_offline' / 'cursors'
GREEN = '#245a49'
AMBER = '#b87925'
RED = '#b3261e'
PAPER = '#fffdf7'
INK = '#1d1d1b'
SIZE = 32
SS = 4  # supersampling keeps strokes even when SketchUp scales the cursor


def cursor(key):
    s = SS
    im = Image.new('RGBA', (SIZE * s, SIZE * s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)

    def line(points, color=INK, width=1.6):
        d.line([(round(x * s), round(y * s)) for x, y in points], fill=color, width=round(width * s))

    # Crosshair: the hotspot is (3,3); white halo first so it reads on any finish.
    for color, width in ((PAPER, 3.6), (INK, 1.4)):
        line([(3, 0), (3, 8)], color, width)
        line([(0, 3), (8, 3)], color, width)
    box = (11, 11, 29, 29)
    d.rounded_rectangle(tuple(round(v * s) for v in box), radius=3 * s, fill=PAPER, outline=GREEN, width=round(1.6 * s))
    if key == 'piece':
        # Board with both broad faces filled.
        d.rectangle(tuple(round(v * s) for v in (15, 15, 25, 25)), fill=AMBER)
    elif key == 'edge':
        # Board outline with one thick banded side.
        d.rectangle(tuple(round(v * s) for v in (15, 15, 25, 25)), outline=GREEN, width=round(1.2 * s))
        line([(25, 14.5), (25, 25.5)], AMBER, 3.0)
    elif key == 'remove':
        d.rectangle(tuple(round(v * s) for v in (15, 15, 25, 25)), outline=GREEN, width=round(1.2 * s))
        line([(16, 16), (24, 24)], RED, 2.0)
        line([(24, 16), (16, 24)], RED, 2.0)
    elif key == 'blocked':
        d.ellipse(tuple(round(v * s) for v in (14, 14, 26, 26)), outline=RED, width=round(2.0 * s))
        line([(16.2, 23.8), (23.8, 16.2)], RED, 2.0)
    elif key == 'sample':
        # Temporary eyedropper (PINTURA-07): bulb, tube and one drop of finish.
        d.ellipse(tuple(round(v * s) for v in (21, 13, 26, 18)), fill=GREEN)
        line([(16, 23), (22.5, 16.5)], INK, 2.2)
        d.ellipse(tuple(round(v * s) for v in (14, 24, 17, 27)), fill=AMBER)
    return im.resize((SIZE, SIZE), Image.LANCZOS)


def main():
    DEST.mkdir(parents=True, exist_ok=True)
    for key in ('piece', 'edge', 'remove', 'blocked', 'sample'):
        cursor(key).save(DEST / f'paint-{key}.png', optimize=True)


if __name__ == '__main__':
    main()
