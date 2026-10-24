"""Generate synthetic parity fixtures using the user's unchanged Python oracle.

Usage: python3 scripts/generate-experto-reference.py /path/to/nesting_experto405.py
The source is deliberately not downloaded/executed from a network location.
"""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

source = Path(sys.argv[1]).resolve()
expected_sha = "28114a6a3c54092611fc30fe1a6bab6e34effb6d2eabbe56b32d2071f9d07e1f"
digest = hashlib.sha256(source.read_bytes()).hexdigest()
if digest != expected_sha:
    raise SystemExit("Reference changed; review it before updating the pinned SHA256.")
# Printed provenance makes fixture regeneration independently auditable.
print("Reference SHA256:", digest)
module_spec = importlib.util.spec_from_file_location("experto_reference", source)
oracle = importlib.util.module_from_spec(module_spec)
sys.modules[module_spec.name] = oracle
module_spec.loader.exec_module(oracle)


def piece(pid, base, height, qty=1):
    return {"id": pid, "largo": base, "ancho": height, "cantidad": qty}


cases = [
    ("supplier_case_A", "faplac", True, [piece("A", 1500, 1500, 3)]),
    ("exact_usable_length", "faplac", False, [piece("A", 2740, 600)]),
    ("twelve_panels", "egger", True, [piece("E", 764, 580, 8), piece("L", 720, 580, 4)]),
    ("stable_ties", "egger", True, [piece("A", 600, 400), piece("B", 400, 600), piece("C", 600, 400), piece("D", 400, 600)]),
    ("forced_rotation", "egger", True, [piece("A", 600, 2400), piece("B", 400, 2000), piece("C", 300, 1900)]),
    ("decimals", "egger", False, [piece("A", 1200.3, 600.25, 3), piece("B", 200.75, 100.1, 4)]),
    ("small_depth_limit", "faplac", True, [piece(f"S{i}", 50 + i * 37 % 450, 50 + i * 43 % 350) for i in range(64)]),
    ("all_open_sheets", "egger", True, [piece(f"M{i}", 100 + i * 131 % 2300, 50 + i * 71 % 1650) for i in range(52)]),
    ("grain_locked", "faplac", False, [piece(f"G{i}", 70 + i * 191 % 2400, 50 + i * 97 % 1650) for i in range(48)]),
]
results = []
for name, brand, rotate, pieces in cases:
    result = oracle.optimizar(pieces, brand, rotate)
    base, height = oracle.PLACAS[brand]
    expanded = [{"id": p["id"], "detail": p["id"], "base": p["largo"], "height": p["ancho"], "rotate": rotate}
                for p in pieces for _ in range(p["cantidad"])]
    results.append({"name": name, "spec": {"lengthMm": base, "widthMm": height, "trimMm": 10, "kerfMm": 4.4},
                    "pieces": expanded, "expected": result})
target = Path(__file__).resolve().parents[1] / "tests/fixtures/experto/reference.json"
target.write_text(json.dumps({"sourceSha256": digest, "cases": results}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Wrote {len(results)} cases to {target}")
