"""Compare supplied native PDF and cloud replay. Requires PyMuPDF; no SKP execution."""
from pathlib import Path
from collections import Counter
import hashlib,json,re
import fitz
root=Path('fixtures/private/validacion-071-recibida')
native=root/'evidence/bm17-dos-vistas-a4.pdf'
replay=Path('artifacts/BM17-REPLAY-073.pdf')
def inspect(path):
    d=fitz.open(path)
    assert len(d)==1
    page=d[0];assert abs(page.rect.width*25.4/72-297)<.0001 and abs(page.rect.height*25.4/72-210)<.0001
    spans=[span['text'] for block in page.get_text('dict')['blocks'] if 'lines' in block for line in block['lines'] for span in line['spans']]
    measures=[s for s in spans if re.fullmatch(r'(?:largo |ancho )?\d+(?:[,.]\d+)? mm',s)]
    return spans,measures
before,mb=inspect(native);after,ma=inspect(replay)
assert Counter(before)==Counter(after),'Cambió el texto del PDF'
assert Counter(mb)==Counter(ma) and len(ma)==26,'Cotas distintas o faltantes'
assert hashlib.sha256((root/'BM17-original-fixture.skp').read_bytes()).hexdigest()=='6be09dfb6a24872a28f9efe3b379644c0ee93b788272ec30e8edd146417eef22'
report={'nativePdfSHA256':hashlib.sha256(native.read_bytes()).hexdigest(),'replayPdfSHA256':hashlib.sha256(replay.read_bytes()).hexdigest(),'pages':1,'sizeMm':[297,210],'identicalTextMultiset':True,'textSpans':len(after),'dimensionTextCount':len(ma),'dimensionValuesUnchanged':True,'originalSkpHashMatches':True,'sketchupExecutedHere':False,'requiresNativeExportValidation':True}
Path('artifacts/bm17-073-comparison.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
