"""Old (0.8.19 PNG 32 enlarged bilinear by the system) vs new (vector at 32×scale)
cursors at 100/125/150 %, on white, wood and dark, zoomed ×3 nearest-neighbour
so pixels are visible. Hot spot marked with a 1 px magenta tick outside the tile.
Usage: cursors_sheet.py REPO OLD_DIR OUT.png"""
import importlib.util, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

repo, old_dir, out = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
spec = importlib.util.spec_from_file_location('cursors', repo / 'scripts' / 'generate-paint-cursors.py')
cur = importlib.util.module_from_spec(spec); spec.loader.exec_module(cur)
KEYS = cur.KEYS
SCALES = (1.0, 1.25, 1.5)
BGS = ((255, 255, 255), (150, 98, 52), (40, 40, 44))
Z = 3
font = ImageFont.truetype('/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf', 18)
tile = 48 + 8
cols = len(KEYS) * len(BGS)
W = 150 + cols * tile * Z // 1 // 1
rows = []
for version in ('0.8.19', '0.8.20'):
    for s in SCALES:
        rows.append((version, s))
H = 40 + len(rows) * (tile * Z + 10)
sheet = Image.new('RGB', (150 + cols * (tile * Z + 6), H), (225, 225, 225))
d = ImageDraw.Draw(sheet)
for r, (version, s) in enumerate(rows):
    y = 40 + r * (tile * Z + 10)
    d.text((10, y + 60), f'{version}\n{int(s * 100)} %', font=font, fill=(0, 0, 0))
    size = round(32 * s)
    for k, key in enumerate(KEYS):
        if version == '0.8.19':
            im = Image.open(old_dir / f'paint-{key}.png').convert('RGBA').resize((size, size), Image.BILINEAR)
        else:
            im = cur.raster(key, size)
        for b, bg in enumerate(BGS):
            t = Image.new('RGBA', (tile, tile), bg + (255,))
            t.alpha_composite(im, (4, 4))
            x = 150 + (k * len(BGS) + b) * (tile * Z + 6)
            sheet.paste(t.convert('RGB').resize((tile * Z, tile * Z), Image.NEAREST), (x, y))
for k, key in enumerate(KEYS):
    d.text((150 + k * len(BGS) * (tile * Z + 6) + 10, 10), key, font=font, fill=(0, 0, 0))
sheet.save(out)
print(out, sheet.size)
