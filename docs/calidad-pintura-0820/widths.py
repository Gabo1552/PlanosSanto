"""Advance widths (em fractions) of the simulation font, for the Ruby double's text_bounds."""
import json, sys
from PIL import ImageFont

REG = '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'
BOLD = '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'
chars = ''.join(chr(c) for c in range(32, 127)) + 'áéíóúñÁÉÍÓÚÑüÜ…·‹›↑↓–—«»¿¡'
out = {}
for name, path in (('regular', REG), ('bold', BOLD)):
    font = ImageFont.truetype(path, 1000)
    out[name] = {ch: font.getlength(ch) / 1000 for ch in chars}
json.dump(out, open(sys.argv[1], 'w'), ensure_ascii=False)
