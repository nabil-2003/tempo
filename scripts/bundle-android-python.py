"""Bundle the pinned, pure-Python extractor and EJS data into the Android module."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
import hashlib
import re

ROOT = Path(__file__).resolve().parents[1]
SITE = next((ROOT / 'backend/.venv/lib').glob('python*/site-packages'))
EXPECTED = {'yt_dlp': '2026.10.26', 'yt_dlp_ejs': '0.8.0'}
for package, version in EXPECTED.items():
    metadata = SITE / f'{package}-{version}.dist-info/METADATA'
    if not metadata.exists() or not re.search(rf'^Version: {re.escape(version)}$', metadata.read_text(), re.M):
        raise SystemExit(f'Install {package}=={version} into backend/.venv before bundling.')
ASSETS = ROOT / 'modules/tempo-engine/android/src/main/assets'
ASSETS.mkdir(parents=True, exist_ok=True)
output = ASSETS / 'tempo-ytdlp'
with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
    def write(name, data):
        info = ZipInfo(name, (1980,1,1,0,0,0)); info.compress_type = ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        archive.writestr(info, data)
    write('__main__.py', b'from yt_dlp import main\nmain()\n')
    for package, version in EXPECTED.items():
        for directory in [SITE / package, SITE / f'{package}-{version}.dist-info']:
            for path in sorted(directory.rglob('*')):
                if path.is_file() and '__pycache__' not in path.parts and path.suffix != '.pyc':
                    write(str(path.relative_to(SITE)), path.read_bytes())
digest = hashlib.sha256(output.read_bytes()).hexdigest()
(ASSETS / 'tempo-ytdlp.sha256').write_text(digest + '\n')
print(f'Bundled yt-dlp {EXPECTED["yt_dlp"]} + EJS {EXPECTED["yt_dlp_ejs"]}: {output.stat().st_size} bytes, SHA256 {digest}')
