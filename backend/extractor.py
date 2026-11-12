from urllib.parse import urlparse
import ipaddress
import socket
import yt_dlp
from fastapi import HTTPException
from models import MAX_URL_LENGTH, MediaResult, MediaFormat

def extractor_options() -> dict:
    # Deliberately omit cookies, login credentials, proxy options, and playlist
    # expansion. This backend does not bypass access controls or DRM.
    return {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "skip_download": True,
        "extract_flat": False,
        "socket_timeout": 20,
        "retries": 1,
        "allow_unplayable_formats": False,
        "geo_bypass": False,
        "cachedir": False,
    }


def validate_source_url(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(status_code=400, detail="A valid HTTP(S) media URL is required.")
    if len(value) > MAX_URL_LENGTH:
        raise HTTPException(status_code=400, detail="The media URL is too long.")
    try:
        port = parsed.port
    except ValueError as error:
        raise HTTPException(400, "Invalid media URL port.") from error
    if parsed.username or parsed.password or port not in (None, 80, 443):
        raise HTTPException(status_code=400, detail="Credentials and custom ports are not supported.")
    try:
        addresses = socket.getaddrinfo(parsed.hostname, None)
        if any(not ipaddress.ip_address(item[4][0]).is_global for item in addresses):
            raise HTTPException(status_code=400, detail="Only public internet sources are supported.")
    except (socket.gaierror, ValueError) as error:
        raise HTTPException(status_code=400, detail="The media hostname could not be resolved.") from error
    return value


def to_result(info: dict) -> MediaResult:
    source_url = info.get("webpage_url") or info.get("original_url") or (info.get("url") if str(info.get("url", "")).startswith("http") else "") or ""
    formats = []
    for item in info.get("formats") or []:
        if item.get("acodec") not in (None, "none"):
            formats.append(
                MediaFormat(
                    format_id=str(item.get("format_id", "")),
                    extension=str(item.get("ext", "")),
                    audio_bitrate=round(item["abr"]) if item.get("abr") else None,
                    file_size=round(item.get("filesize") or item.get("filesize_approx") or 0) or None,
                )
            )
    return MediaResult(
        id=str(info.get("id") or source_url),
        title=str(info.get("title") or "Untitled"),
        artist=str(info.get("artist") or info.get("channel") or info.get("uploader") or "Unknown artist"),
        duration=max(0, int(info.get("duration") or 0)),
        thumbnail_url=info.get("thumbnail") or next((t.get("url") for t in reversed(info.get("thumbnails") or []) if isinstance(t, dict) and t.get("url")), None),
        source_url=source_url,
        provider=str(info.get("extractor_key") or info.get("extractor") or "yt-dlp"),
        downloadable=bool(source_url and not info.get("is_live") and not info.get("has_drm") and info.get("availability") not in {"private", "premium_only", "subscriber_only", "needs_auth"}),
        formats=formats[:30],
    )


def extract_info(source: str) -> dict:
    try:
        with yt_dlp.YoutubeDL({**extractor_options(), **({"extract_flat": "in_playlist"} if source.startswith("ytsearch") else {})}) as downloader:
            info = downloader.extract_info(source, download=False)
    except yt_dlp.utils.DownloadError as error:
        raise HTTPException(
            status_code=422,
            detail="The source is unavailable, unsupported, restricted, or protected.",
        ) from error
    if not isinstance(info, dict):
        raise HTTPException(status_code=422, detail="The source did not return media information.")
    return info




def extract_playlist(source: str) -> dict:
    """Resolve public playlists only; extraction never confers download rights."""
    try:
        with yt_dlp.YoutubeDL({**extractor_options(), 'noplaylist': False,
                              'extract_flat': 'in_playlist', 'ignoreerrors': True,
                              'playlistend': 501}) as downloader:
            info = downloader.extract_info(source, download=False)
    except yt_dlp.utils.DownloadError as error:
        raise HTTPException(422, 'Playlist unavailable, unsupported, restricted, or protected.') from error
    if not isinstance(info, dict) or info.get('_type') not in {'playlist', 'multi_video'}:
        raise HTTPException(422, 'This URL did not resolve to a supported playlist.')
    entries = list(info.get('entries') or [])
    if len(entries) > 500 or (info.get('playlist_count') or 0) > 500:
        raise HTTPException(422, 'Choose a playlist with 500 tracks or fewer.')
    tracks = []
    for index, entry in enumerate(entries):
        media = to_result(entry) if isinstance(entry, dict) else None
        # HTML5 multi-video pages share one webpage_url for every audio element.
        # Use each element's own URL so deduplication does not collapse the list.
        if media and (info.get('_type') == 'multi_video' or entry.get('extractor_key') == 'HTML5MediaEmbed') and str(entry.get('url', '')).startswith(('https://', 'http://')):
            media.source_url = entry['url']
        if media and media.title in {'[Private video]', '[Deleted video]'}:
            media.downloadable = False
        tracks.append({'index': index, 'media': media.model_dump() if media else None,
                       'error': None if media and media.downloadable else 'Unavailable, restricted, or protected track.'})
    if not tracks:
        raise HTTPException(422, 'The playlist contains no accessible track information.')
    return {'title': info.get('title') or 'Downloaded playlist', 'source_url': source, 'tracks': tracks}


def search_playlists(query: str) -> list[dict]:
    """Name search via yt-dlp's public YouTube search URL, playlists filter only."""
    from urllib.parse import urlencode, parse_qs
    import re
    if not query.strip() or '://' in query:
        raise HTTPException(400, 'Enter a playlist or artist name.')
    source = 'https://www.youtube.com/results?' + urlencode({'search_query': query.strip(), 'sp': 'EgIQAw=='})
    try:
        with yt_dlp.YoutubeDL({**extractor_options(), 'extract_flat': True, 'playlistend': 10}) as downloader:
            info = downloader.extract_info(source, download=False)
    except yt_dlp.utils.DownloadError as error:
        raise HTTPException(422, 'Playlist search is unavailable. Check your connection and retry.') from error
    if not isinstance(info, dict):
        raise HTTPException(422, 'The source did not return playlist information.')
    results, seen = [], set()
    for entry in info.get('entries') or []:
        if not isinstance(entry, dict):
            continue
        raw_url = entry.get('url') or entry.get('webpage_url') or ''
        parsed = urlparse(raw_url)
        playlist_id = parse_qs(parsed.query).get('list', [''])[0]
        if parsed.hostname not in {'www.youtube.com', 'youtube.com', 'music.youtube.com'} or not re.fullmatch(r'[A-Za-z0-9_-]{1,200}', playlist_id) or playlist_id in seen:
            continue
        seen.add(playlist_id)
        media = to_result(entry)
        results.append({'id': playlist_id, 'title': media.title, 'artist': media.artist,
                        'thumbnail_url': media.thumbnail_url,
                        'source_url': f'https://www.youtube.com/playlist?list={playlist_id}',
                        'track_count': entry.get('playlist_count')})
        if len(results) == 10:
            break
    return results
