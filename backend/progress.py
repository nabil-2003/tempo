"""Actual yt-dlp progress, shared by child worker and job polling."""
import json
import os
import time
from pathlib import Path

class ProgressWriter:
    def __init__(self, directory):
        self.path = Path(directory) / 'progress.json'
        self.last = 0

    def __call__(self, value):
        now = time.monotonic()
        if value.get('phase') == 'source_download' and now - self.last < .2:
            return
        self.last = now
        temporary = self.path.with_suffix('.tmp')
        temporary.write_text(json.dumps(value))
        os.replace(temporary, self.path)

def download_hook(report):
    def hook(data):
        if data.get('status') == 'downloading':
            total = data.get('total_bytes') or data.get('total_bytes_estimate')
            done = data.get('downloaded_bytes', 0)
            report({'phase': 'source_download', 'bytes': done, 'total': total,
                    'percent': min(100, round(done / total * 100, 1)) if total else None,
                    'estimated': not bool(data.get('total_bytes'))})
        elif data.get('status') == 'finished':
            report({'phase': 'processing', 'percent': None})
    return hook
