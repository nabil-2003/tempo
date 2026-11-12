from progress import ProgressWriter, download_hook
from pathlib import Path
import shutil
import yt_dlp
from fastapi import HTTPException
from extractor import extractor_options, extract_info, to_result

def convert_to_mp3(source: str, output_dir: str, quality: int = 192) -> Path:
    report = ProgressWriter(output_dir)
    report({"phase": "extracting", "percent": None})
    output = Path(output_dir) / "audio.mp3"
    options = {
        **extractor_options(),
        "skip_download": False,
        "progress_hooks": [download_hook(report)],
        "postprocessor_hooks": [lambda data: report({"phase": "converting", "percent": None})],
        "format": "bestaudio/best",
        "outtmpl": str(Path(output_dir) / "source.%(ext)s"),
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": str(quality),
            }
        ],
    }
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        raise HTTPException(status_code=503, detail="Install FFmpeg and ffprobe on the backend.")
    info = extract_info(source)
    if not to_result(info).downloadable or info.get("_type") in {"playlist", "multi_video"}:
        raise HTTPException(status_code=422, detail="This media is live, restricted, protected, or a playlist.")
    try:
        with yt_dlp.YoutubeDL(options) as downloader:
            downloader.download([source])
    except yt_dlp.utils.DownloadError as error:
        raise HTTPException(
            status_code=422,
            detail="The media could not be downloaded or converted by the authorized provider.",
        ) from error

    converted = next(Path(output_dir).glob("source*.mp3"), None)
    if converted is None or not converted.is_file() or converted.stat().st_size == 0:
        raise HTTPException(status_code=422, detail="FFmpeg did not produce a valid MP3 file.")
    converted.rename(output)
    return output




def download_original(source: str, output_dir: str) -> Path:
    """Save the best available audio-only stream without re-encoding."""
    from audio_formats import AUDIO_MIME_TYPES
    report = ProgressWriter(output_dir)
    report({"phase": "extracting", "percent": None})

    info = extract_info(source)
    if not to_result(info).downloadable or info.get("_type") in {"playlist", "multi_video"}:
        raise HTTPException(422, "This media is live, restricted, protected, or a playlist.")
    options = {
        **extractor_options(),
        "skip_download": False,
        "progress_hooks": [download_hook(report)],
        "postprocessor_hooks": [lambda data: report({"phase": "converting", "percent": None})],
        "format": "bestaudio",  # Never fall back to a video file or lossy conversion.
        "outtmpl": str(Path(output_dir) / "audio.%(ext)s"),
        "postprocessors": [],
        "fixup": "never",
    }
    try:
        with yt_dlp.YoutubeDL(options) as downloader:
            downloader.download([source])
    except yt_dlp.utils.DownloadError as error:
        raise HTTPException(422, "An accessible original audio-only stream is unavailable. Try an MP3 preset or another authorized source.") from error
    outputs = [file for file in Path(output_dir).glob("audio.*") if file.suffix[1:] in AUDIO_MIME_TYPES]
    if len(outputs) != 1 or outputs[0].stat().st_size == 0:
        raise HTTPException(422, "The original audio format is unsupported. Try an MP3 preset.")
    return outputs[0]
