"""Reproducible .rbz (ZIP) from reviewed extension files only; never includes the private SKP."""
from pathlib import Path
import hashlib
import zipfile

root = Path(__file__).resolve().parents[1]
files = ["planos_santo.rb", "planos_santo/main.rb", "planos_santo/exporter.rb", "planos_santo/transport.rb", "planos_santo/zip_bundle.rb", "planos_santo/review.html", "planos_santo/icon-24.png", "planos_santo/icon-32.png"]
target = root / "artifacts/PlanosSanto-0.3.0.rbz"
target.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as archive:
    for name in files:
        path = root / "sketchup" / name
        info = zipfile.ZipInfo(name, date_time=(2026, 10, 15, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, path.read_bytes())
with zipfile.ZipFile(target) as archive:
    assert archive.testzip() is None
    assert archive.namelist() == files
    assert all(not name.endswith('.skp') for name in archive.namelist())
digest = hashlib.sha256(target.read_bytes()).hexdigest()
target.with_suffix('.rbz.sha256').write_text(f"{digest}  {target.name}\n")
print(f"{target.name}: {target.stat().st_size} bytes; SHA256 {digest}; ZIP CRC OK")
