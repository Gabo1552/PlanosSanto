"""Rasterize the recorded draw2d/draw_text commands of the paint tool double.
Simulation only: Liberation Sans (Arial metrics) stands in for Segoe UI and
Pillow's antialiased text for SketchUp's. Usage: render.py IN.json OUT.png REPO [old]"""
import importlib.util, json, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

REG = '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'
BOLD = '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'
src, out, repo = sys.argv[1], sys.argv[2], Path(sys.argv[3])
old = len(sys.argv) > 4 and sys.argv[4] == 'old'
data = json.load(open(src))
W, H, s = data['width'], data['height'], data['scale']


def wood(w, h):
    im = Image.new('RGB', (w, h))
    px = im.load()
    import math
    for y in range(h):
        for x in range(w):
            g = math.sin(y * 0.09 + 3 * math.sin(x * 0.004) + 0.6 * math.sin(y * 0.5)) * 0.5 + 0.5
            px[x, y] = (int(132 + 40 * g), int(84 + 26 * g), int(44 + 14 * g))
    return im


TEXTURE = wood(1024, 512)
# Background: a light model view with one board, like SketchUp's default style.
img = Image.new('RGBA', (W, H), (255, 255, 255, 255))
d = ImageDraw.Draw(img)
for y in range(H):
    t = y / H
    d.line([(0, y), (W, y)], fill=(int(212 + 30 * t), int(226 + 20 * t), int(236 + 14 * t), 255))
d.polygon([(0.30 * W, 0.70 * H), (0.62 * W, 0.62 * H), (0.80 * W, 0.70 * H), (0.48 * W, 0.80 * H)], fill=(222, 218, 210, 255), outline=(40, 40, 40, 255))
d.polygon([(0.38 * W, 0.30 * H), (0.58 * W, 0.26 * H), (0.58 * W, 0.62 * H), (0.38 * W, 0.68 * H)], fill=(236, 233, 226, 255), outline=(40, 40, 40, 255))


def overlay(fn):
    global img
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    fn(ImageDraw.Draw(layer), layer)
    img = Image.alpha_composite(img, layer)


def color(c):
    if isinstance(c, list):
        return tuple(c[:4]) if len(c) >= 4 else tuple(c[:3]) + (255,)
    return (255, 165, 0, 255)


for cmd in data['cmds']:
    if cmd['k'] == '2d':
        pts, mode, col, width = cmd['pts'], cmd['mode'], color(cmd['color']), int(cmd['width'] or 1)
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        if mode == 7 and cmd.get('texture'):
            l, t, r, b = round(min(xs)), round(min(ys)), round(max(xs)), round(max(ys))
            uvs = cmd['uvs']; u0, u1 = uvs[0][0], uvs[1][0]; v1, v0 = uvs[0][1], uvs[3][1]
            crop = TEXTURE.crop((round(u0 * 1024), round((1 - v1) * 512), round(u1 * 1024), round((1 - v0) * 512))).resize((r - l, b - t), Image.LANCZOS)
            img.paste(crop.convert('RGBA'), (l, t))
        elif mode == 7:
            l, t, r, b = min(xs), min(ys), max(xs), max(ys)
            overlay(lambda dd, _: dd.rectangle([round(l), round(t), round(r) - 1, round(b) - 1], fill=col))
        elif mode == 2:
            half = width / 2
            l, t, r, b = min(xs) - half, min(ys) - half, max(xs) + half, max(ys) + half
            overlay(lambda dd, _: dd.rectangle([round(l), round(t), round(r) - 1, round(b) - 1], outline=col, width=width))
        elif mode == 1:
            for a, c2 in zip(pts[0::2], pts[1::2]):
                x = a[0] - 0.5
                overlay(lambda dd, _: dd.line([(round(x), round(a[1])), (round(x), round(c2[1]) - 1)], fill=col, width=width))
    else:
        size = int(cmd['size'] or 12)
        font = ImageFont.truetype(BOLD if cmd['bold'] else REG, size)
        x, y = cmd['pt']
        anchor = {0: 'l', 1: 'm'}.get(cmd.get('align'), 'l') + ('m' if cmd.get('valign') == 3 else 'a')
        overlay(lambda dd, _: dd.text((x, y), cmd['text'], font=font, fill=color(cmd['color']), anchor=anchor))

# Cursor at the mouse. New: the vector cursor at 32 × scale (same primitives as
# the SVG). Old: the 32 px PNG enlarged by the system (bilinear), as the
# pixelated look suggests.
mx, my = data['mouse']
spec = importlib.util.spec_from_file_location('cursors', repo / 'scripts' / 'generate-paint-cursors.py')
cursors = importlib.util.module_from_spec(spec); spec.loader.exec_module(cursors)
size = round(32 * s)
if old:
    cur = Image.open(Path(sys.argv[5]) if len(sys.argv) > 5 else repo / 'sketchup_offline/cursors/paint-edge.png').convert('RGBA').resize((size, size), Image.BILINEAR)
    hot = round(3 * s)
else:
    cur = cursors.raster('edge', size)
    hot = round(cursors.HOTSPOT[0] * s)
img.alpha_composite(cur, (mx - hot, my - hot))
img.convert('RGB').save(out)
print(out, img.size)
