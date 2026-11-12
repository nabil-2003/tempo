"""Download the project's exact NDK revision into a persistent, resumable cache.

Run with Python 3.11+. This only downloads/verifies; it never changes the SDK.
"""
from concurrent.futures import ThreadPoolExecutor, wait
from pathlib import Path
import json
import time
from urllib.request import Request, urlopen
from zipfile import ZipFile

URL = 'https://dl.google.com/android/repository/android-ndk-r27b-linux.zip'
CACHE = Path(__file__).resolve().parents[1] / '.build-cache' / 'android-ndk-r27b'
CACHE.mkdir(parents=True, exist_ok=True)
ARCHIVE = CACHE / 'android-ndk-r27b-linux.zip'
CHUNK = 8 * 1024 * 1024


def download():
    with urlopen(Request(URL, method='HEAD'), timeout=30) as response:
        size = int(response.headers['Content-Length'])
        etag = response.headers.get('ETag')
    identity = {'url': URL, 'size': size, 'etag': etag, 'chunk': CHUNK}
    manifest = CACHE / 'download.json'
    if manifest.exists() and json.loads(manifest.read_text()) != identity:
        raise RuntimeError('Archive identity changed. Review the cached files before retrying.')
    manifest.write_text(json.dumps(identity, indent=2))
    count = (size + CHUNK - 1) // CHUNK

    def fetch(index):
        start = index * CHUNK
        end = min(size, start + CHUNK) - 1
        target = CACHE / f'{index:04d}.part'
        for attempt in range(8):
            offset = target.stat().st_size if target.exists() else 0
            if offset == end - start + 1:
                return
            if offset > end - start + 1:
                raise RuntimeError(f'Oversized cache segment {index}')
            try:
                request = Request(URL, headers={'Range': f'bytes={start + offset}-{end}'})
                with urlopen(request, timeout=45) as response:
                    expected = f'bytes {start + offset}-{end}/{size}'
                    if response.status != 206 or response.headers.get('Content-Range') != expected:
                        raise RuntimeError('Server did not return the requested archive range')
                    with target.open('ab') as output:
                        while block := response.read(64 * 1024):
                            output.write(block)
                if target.stat().st_size == end - start + 1:
                    return
            except Exception:
                if attempt == 7:
                    raise
                time.sleep(min(2 ** attempt, 15))
        raise RuntimeError(f'Incomplete segment {index}; rerun to resume')

    if not ARCHIVE.exists():
        with ThreadPoolExecutor(max_workers=32) as executor:
            pending = {executor.submit(fetch, index) for index in range(count)}
            while pending:
                done, pending = wait(pending, timeout=5)
                for future in done:
                    future.result()
                downloaded = sum(path.stat().st_size for path in CACHE.glob('*.part'))
                print(f'NDK: {downloaded / 1048576:.1f} / {size / 1048576:.1f} MiB', flush=True)
        temporary = ARCHIVE.with_suffix('.zip.tmp')
        with temporary.open('wb') as output:
            for index in range(count):
                with (CACHE / f'{index:04d}.part').open('rb') as source:
                    while block := source.read(1024 * 1024):
                        output.write(block)
        if temporary.stat().st_size != size:
            raise RuntimeError('Combined archive size does not match the official download')
        verify(temporary)
        temporary.replace(ARCHIVE)
    else:
        verify(ARCHIVE)
    print(f'Verified archive: {ARCHIVE}', flush=True)


def verify(path):
    with ZipFile(path) as archive:
        failed = archive.testzip()
        if failed:
            raise RuntimeError(f'Archive CRC failed: {failed}')
        properties = archive.read('android-ndk-r27b/source.properties').decode()
        if '27.1.12297006' not in properties:
            raise RuntimeError('Unexpected NDK revision')


if __name__ == '__main__':
    download()
