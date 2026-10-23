#!/usr/bin/env python3
"""Draw the original Planos Santo paint cursors (Hito 2, PINTURA-12; 0.8.20).

Own design, no external assets. Every cursor shares one 32-unit grid (the
cursor size Windows and SketchUp expect at 100 %):
  * a crosshair whose centre is the hot spot HOTSPOT=(7,7): the point of the
    grid where the lines cross (the pixel whose top-left corner is (7,7) is
    the active pixel, as UI.create_cursor counts it from the top-left);
  * a dark badge (12..30.5) with one symbol per mode, the same dark/orange of
    the in-view bar.
High contrast on any finish: every stroke and the badge carry a white halo
and a black edge, so they read on a white board, on wenge and on the sky.

One drawing, three files per cursor (sketchup_offline/cursors/):
  paint-<key>.svg     vector, 32x32 viewBox: SketchUp on Windows takes SVG
                      cursors (API docs, UI.create_cursor, since 2016) and
                      renders them sharp at 125-200 %; hot spot in 32 units.
  paint-<key>.png     32 px raster: fallback (and macOS, which wants PDF for
                      vectors); hot spot (7,7).
  paint-<key>-64.png  64 px raster: fallback at UI.scale_factor >= 1.5 on
                      Windows when the SVG is missing; hot spot (14,14).
The PNGs are drawn 8x larger and reduced with Lanczos, so strokes keep their
weight. Run from any directory (needs Pillow): python3 scripts/generate-paint-cursors.py
The output is byte-for-byte reproducible.
"""
from pathlib import Path
from PIL import Image, ImageDraw

DEST = Path(__file__).resolve().parents[1] / 'sketchup_offline' / 'cursors'
KEYS = ('piece', 'edge', 'remove', 'blocked', 'sample')
HOTSPOT = (7, 7)
GRID = 32
SS = 8  # supersampling of the raster versions
WHITE = '#ffffff'
BLACK = '#111111'
BADGE = '#2f2a26'
ORANGE = '#f08014'
RED = '#ff4b3e'


def shapes(key):
    """Primitives in grid units, in paint order.
    ('rect', x0, y0, x1, y1, fill, stroke, width, radius)
    ('line', [(x, y), ...], stroke, width)        butt caps, miter joins
    ('circle', cx, cy, r, fill, stroke, width)
    """
    hx, hy = HOTSPOT
    out = []
    # Crosshair: four arms with a gap and a 2x2 centre square on the hot spot.
    arms = [[(hx - 7, hy), (hx - 2.5, hy)], [(hx + 2.5, hy), (hx + 7, hy)],
            [(hx, hy - 7), (hx, hy - 2.5)], [(hx, hy + 2.5), (hx, hy + 7)]]
    for arm in arms:
        out.append(('line', arm, WHITE, 4))
    out.append(('rect', hx - 2, hy - 2, hx + 2, hy + 2, WHITE, None, 0, 0))
    for arm in arms:
        out.append(('line', arm, BLACK, 2))
    out.append(('rect', hx - 1, hy - 1, hx + 1, hy + 1, BLACK, None, 0, 0))
    # Badge: black edge, white ring, dark face.
    out.append(('rect', 12, 12, 30.5, 30.5, BADGE, BLACK, 3, 3.5))
    out.append(('rect', 12, 12, 30.5, 30.5, None, WHITE, 1.4, 3.5))
    sym = []
    if key == 'piece':
        # Board with its broad face painted.
        sym.append(('rect', 17, 18, 27.5, 26.5, ORANGE, WHITE, 1.4, 0))
    elif key == 'edge':
        # Board outline with one thick banded side.
        sym.append(('rect', 17, 18, 26.3, 26.5, None, WHITE, 1.4, 0))
        sym.append(('line', [(26.8, 17.3), (26.8, 27.2)], ORANGE, 3))
    elif key == 'remove':
        sym.append(('rect', 17, 18, 25.5, 26.5, None, WHITE, 1.4, 0))
        sym.append(('line', [(18.2, 17.2), (27.6, 27.4)], RED, 2.4))
        sym.append(('line', [(27.6, 17.2), (18.2, 27.4)], RED, 2.4))
    elif key == 'blocked':
        sym.append(('circle', 22.25, 22.25, 6, None, RED, 2.4))
        sym.append(('line', [(18.1, 26.4), (26.4, 18.1)], RED, 2.4))
    elif key == 'sample':
        # Dropper: bulb up-right, tip down-left, one drop of the sampled finish.
        sym.append(('line', [(18.6, 25.9), (25.2, 19.3)], WHITE, 3.4))
        sym.append(('line', [(18.6, 25.9), (17.1, 27.4)], WHITE, 1.5))
        sym.append(('circle', 26.3, 18.2, 2.8, ORANGE, None, 0))
        sym.append(('line', [(22.7, 17.6), (26.6, 21.5)], WHITE, 1.7))
        sym.append(('circle', 16.7, 28.9, 1.5, ORANGE, None, 0))
    # The symbols are drawn around (22.25, 22.25) and placed 12 % larger on the
    # badge centre (21.25, 21.25); the badge edge stays inside the 32 grid.
    out.extend(_place(shape, 22.25, 21.25, 1.12) for shape in sym)
    return out


def _place(shape, src, dst, k):
    move = lambda v: dst + (v - src) * k
    kind = shape[0]
    if kind == 'rect':
        _, x0, y0, x1, y1, fill, stroke, width, radius = shape
        return (kind, move(x0), move(y0), move(x1), move(y1), fill, stroke, width * k, radius * k)
    if kind == 'line':
        _, points, stroke, width = shape
        return (kind, [(move(x), move(y)) for x, y in points], stroke, width * k)
    _, cx, cy, r, fill, stroke, width = shape
    return (kind, move(cx), move(cy), r * k, fill, stroke, width * k)


def fmt(value):
    text = f'{value:.2f}'.rstrip('0').rstrip('.')
    return text if text != '-0' else '0'


def svg(key):
    rows = ['<?xml version="1.0" encoding="UTF-8"?>',
            f'<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="{GRID}" height="{GRID}" viewBox="0 0 {GRID} {GRID}">']
    for shape in shapes(key):
        kind = shape[0]
        if kind == 'rect':
            _, x0, y0, x1, y1, fill, stroke, width, radius = shape
            attrs = f'x="{fmt(x0)}" y="{fmt(y0)}" width="{fmt(x1 - x0)}" height="{fmt(y1 - y0)}"'
            if radius:
                attrs += f' rx="{fmt(radius)}"'
            attrs += f' fill="{fill or "none"}"'
            if stroke:
                attrs += f' stroke="{stroke}" stroke-width="{fmt(width)}"'
            rows.append(f'  <rect {attrs}/>')
        elif kind == 'line':
            _, points, stroke, width = shape
            pts = ' '.join(f'{fmt(x)},{fmt(y)}' for x, y in points)
            rows.append(f'  <polyline points="{pts}" fill="none" stroke="{stroke}" stroke-width="{fmt(width)}" stroke-linecap="butt" stroke-linejoin="miter"/>')
        elif kind == 'circle':
            _, cx, cy, r, fill, stroke, width = shape
            attrs = f'cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(r)}" fill="{fill or "none"}"'
            if stroke:
                attrs += f' stroke="{stroke}" stroke-width="{fmt(width)}"'
            rows.append(f'  <circle {attrs}/>')
    rows.append('</svg>')
    return '\n'.join(rows) + '\n'


def raster(key, size):
    """Same primitives as the SVG; Pillow strokes a box inwards, so a stroked
    box is grown by half the width to centre the stroke on the outline."""
    k = size * SS / GRID
    im = Image.new('RGBA', (size * SS, size * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)

    def box(x0, y0, x1, y1, grow=0.0):
        return (round((x0 - grow) * k), round((y0 - grow) * k), round((x1 + grow) * k) - 1, round((y1 + grow) * k) - 1)

    for shape in shapes(key):
        kind = shape[0]
        if kind == 'rect':
            _, x0, y0, x1, y1, fill, stroke, width, radius = shape
            if fill:
                d.rounded_rectangle(box(x0, y0, x1, y1), radius=round(radius * k), fill=fill)
            if stroke:
                d.rounded_rectangle(box(x0, y0, x1, y1, width / 2), radius=round((radius + width / 2) * k) if radius else 0,
                                    outline=stroke, width=max(1, round(width * k)))
        elif kind == 'line':
            _, points, stroke, width = shape
            d.line([(x * k, y * k) for x, y in points], fill=stroke, width=max(1, round(width * k)))
        elif kind == 'circle':
            _, cx, cy, r, fill, stroke, width = shape
            if fill:
                d.ellipse(box(cx - r, cy - r, cx + r, cy + r), fill=fill)
            if stroke:
                d.ellipse(box(cx - r, cy - r, cx + r, cy + r, width / 2), outline=stroke, width=max(1, round(width * k)))
    return im.resize((size, size), Image.LANCZOS)


def main():
    DEST.mkdir(parents=True, exist_ok=True)
    for key in KEYS:
        (DEST / f'paint-{key}.svg').write_text(svg(key), encoding='utf-8', newline='\n')
        raster(key, 32).save(DEST / f'paint-{key}.png', optimize=True)
        raster(key, 64).save(DEST / f'paint-{key}-64.png', optimize=True)


if __name__ == '__main__':
    main()
