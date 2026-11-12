"""Verify the APK's committed extractor is complete without site-packages."""
import hashlib
from pathlib import Path
import subprocess
import sys
from zipfile import ZipFile

ASSETS = Path(__file__).resolve().parents[1] / 'modules/tempo-engine/android/src/main/assets'
BUNDLE = ASSETS / 'tempo-ytdlp'


def test_bundled_extractor_integrity_and_isolated_execution():
    assert hashlib.sha256(BUNDLE.read_bytes()).hexdigest() == (ASSETS / 'tempo-ytdlp.sha256').read_text().strip()
    with ZipFile(BUNDLE) as bundle:
        assert bundle.testzip() is None
        assert 'Version: 2026.10.26' in bundle.read('yt_dlp-2026.10.26.dist-info/METADATA').decode()
        assert 'Version: 0.8.0' in bundle.read('yt_dlp_ejs-0.8.0.dist-info/METADATA').decode()
    result = subprocess.run([sys.executable, '-S', str(BUNDLE), '--version'], check=True, text=True, capture_output=True, timeout=30)
    assert result.stdout.strip() == '2026.10.26'
    code = "import sys; sys.path.insert(0, sys.argv[1]); from yt_dlp_ejs.yt import solver; assert len(solver.core()) > 1000"
    subprocess.run([sys.executable, '-S', '-c', code, str(BUNDLE)], check=True, timeout=30)
