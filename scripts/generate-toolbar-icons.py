#!/usr/bin/env python3
"""Draw original Planos Santo native icons. Requires Pillow; no external assets.
Coordinates share a 24-unit grid. Supersampling preserves stroke weight at DPI.
The same drawing is also written as one SVG per icon (0.8.18): SketchUp on
Windows takes vector toolbar icons and renders them sharp at 125-200 % scaling,
where the 24/32 px PNGs (kept as the fallback, and for macOS) are upscaled.
Run from any directory: python3 scripts/generate-toolbar-icons.py.
"""
from pathlib import Path
from PIL import Image, ImageDraw

DEST = Path(__file__).resolve().parents[1] / 'sketchup_offline' / 'icons'
GREEN = '#245a49'
AMBER = '#b87925'
PAPER = '#fffdf7'
WARM = '#efece3'
KEYS = ('main','sheet','edge','remove_edge','sample','furniture','order','guides','materials')

def drawing(key, box, line, poly):
    if key=='main':
        box((3,3,21,21));line([(7,17),(7,7),(13,7),(15,9),(13,12),(7,12)]);line([(12,17),(17,17),(17,13),(13,13)],AMBER)
    elif key=='sheet':
        poly([(3,8),(12,4),(21,8),(12,12)]);poly([(3,8),(12,12),(12,20),(3,16)]);poly([(12,12),(21,8),(21,16),(12,20)],'#dde8df')
        line([(15,4),(19,2),(22,5),(18,9)],AMBER,2.2);line([(15,9),(17,11)],AMBER,2.2)
    elif key in ('edge','remove_edge'):
        poly([(3,7),(17,7),(21,11),(7,11)]);poly([(7,11),(21,11),(21,17),(7,17)])
        line([(7,11),(21,11)],AMBER,3)
        if key=='remove_edge':line([(9,5),(18,14)],AMBER,2);line([(18,5),(9,14)],AMBER,2)
        else:line([(3,12),(3,18),(6,21)],AMBER,2)
    elif key=='sample':
        poly([(7,14),(15,6),(18,9),(10,17)],'#dde8df');line([(14,4),(20,10)],GREEN,2.3)
        line([(7,14),(5,20),(10,17)],AMBER,2);line([(17,3),(21,7)],AMBER,2)
    elif key=='furniture':
        box((4,3,20,21));line([(4,10),(20,10)]);line([(4,17),(20,17)]);line([(12,3),(12,21)]);line([(9,12),(9,14)],AMBER,2);line([(15,12),(15,14)],AMBER,2)
    elif key=='order':
        box((5,4,19,22));box((8,2,16,6),WARM);line([(8,10),(10,12),(13,9)],AMBER);line([(14,11),(16,11)]);line([(8,16),(16,16)]);line([(8,19),(14,19)])
    elif key=='guides':
        box((2,5,22,20));line([(3,9),(21,9)]);poly([(5,13),(9,11),(13,13),(9,16)],'#dde8df');line([(16,12),(19,12)],AMBER);line([(16,15),(19,15)]);line([(5,18),(12,18)],AMBER)
    elif key=='materials':
        box((3,3,11,11),'#c7d8c9');box((13,3,21,11),'#ede0bc');box((3,13,11,21),'#e8c9ab');box((13,13,21,21),WARM)
        line([(5,5),(9,5)],GREEN,1);line([(5,8),(9,8)],GREEN,1);line([(15,15),(19,19)],AMBER,1)

def icon(key, size):
    scale = size * 4 / 24
    im = Image.new('RGBA', (size * 4, size * 4), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    def box(xy, fill=PAPER, outline=GREEN, radius=1.5):
        d.rounded_rectangle(tuple(round(x*scale) for x in xy),radius=round(radius*scale),fill=fill,outline=outline,width=round(1.6*scale))
    def line(points, color=GREEN, width=1.6):
        pts=[(round(x*scale),round(y*scale)) for x,y in points]
        d.line(pts,fill=color,width=round(width*scale),joint='curve')
        r=width*scale/2
        for x,y in (pts[0],pts[-1]):d.ellipse((x-r,y-r,x+r,y+r),fill=color)
    def poly(points, fill=WARM, outline=GREEN):
        coords=[(round(x*scale),round(y*scale)) for x,y in points]
        d.polygon(coords,fill=fill);line(points+[points[0]],outline)
    drawing(key, box, line, poly)
    return im.resize((size,size),Image.Resampling.LANCZOS)

def number(value):
    return f'{value:.2f}'.rstrip('0').rstrip('.')

def svg(key):
    """Plain SVG 1.1 (rect, polyline, polygon; no CSS, text or filters)."""
    shapes = []
    def box(xy, fill=PAPER, outline=GREEN, radius=1.5):
        # Pillow strokes inside the box; an SVG stroke is centred on the path.
        x0,y0,x1,y1 = xy;inset = 0.8
        shapes.append(f'<rect x="{number(x0+inset)}" y="{number(y0+inset)}" width="{number(x1-x0-2*inset)}" height="{number(y1-y0-2*inset)}" '
                      f'rx="{number(max(radius-inset,0.4))}" fill="{fill}" stroke="{outline}" stroke-width="1.6"/>')
    def line(points, color=GREEN, width=1.6):
        coords = ' '.join(f'{number(x)},{number(y)}' for x,y in points)
        shapes.append(f'<polyline points="{coords}" fill="none" stroke="{color}" stroke-width="{number(width)}" stroke-linecap="round" stroke-linejoin="round"/>')
    def poly(points, fill=WARM, outline=GREEN):
        coords = ' '.join(f'{number(x)},{number(y)}' for x,y in points)
        shapes.append(f'<polygon points="{coords}" fill="{fill}" stroke="{outline}" stroke-width="1.6" stroke-linejoin="round"/>')
    drawing(key, box, line, poly)
    body = '\n  '.join(shapes)
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="24" height="24" viewBox="0 0 24 24">\n'
            f'  {body}\n</svg>\n')

if __name__=='__main__':
    DEST.mkdir(exist_ok=True)
    for key in KEYS:
        for size in (24,32): icon(key,size).save(DEST/f'{key}-{size}.png')
        (DEST/f'{key}.svg').write_text(svg(key), encoding='utf-8')
    print('18 original toolbar icons generated (24px / 32px) and 9 vector icons (SVG).')
