"""Install an isolated Ruby test runtime if the environment has no Ruby. No system writes."""
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import urllib.request

base = Path('/workspace/.tools')
runtime = base / 'ruby/bin/ruby'
candidate = os.environ.get('RUBY_BIN') or shutil.which('ruby')
if candidate or runtime.exists():
    subprocess.run([candidate or str(runtime), '--version'], check=True)
    raise SystemExit(0)

url = 'https://cache.ruby-lang.org/pub/ruby/3.3/ruby-3.3.7.tar.gz'
# Official ruby/www.ruby-lang.org _data/releases.yml, release 3.3.7.
expected = '9c37c3b12288c7aec20ca121ce76845be5bb5d77662a24919651aaf1d12c8628'
base.mkdir(exist_ok=True, parents=True)
archive = base / 'ruby-3.3.7.tar.gz'
if not archive.exists():
    with urllib.request.urlopen(url, timeout=60) as response:
        archive.write_bytes(response.read())
if hashlib.sha256(archive.read_bytes()).hexdigest() != expected:
    raise RuntimeError('Ruby SHA256 inválido; no se instala ni ejecuta el archivo.')
source = base / 'ruby-3.3.7'
if not source.exists():
    with tarfile.open(archive) as tar:
        tar.extractall(base, filter='data')
with open('/tmp/planos-ruby-setup.log', 'w') as log:
    for command in [
        ['./configure', '--prefix=/workspace/.tools/ruby', '--disable-install-doc', '--without-gmp', '--disable-yjit'],
        ['make', '-j4'], ['make', 'install']
    ]:
        subprocess.run(command, cwd=source, stdout=log, stderr=subprocess.STDOUT, check=True)
subprocess.run([str(runtime), '--version'], check=True)
