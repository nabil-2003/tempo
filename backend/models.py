from typing import Literal
from pydantic import BaseModel, Field

MAX_QUERY_LENGTH = 200
MAX_URL_LENGTH = 2048
ALLOWED_FORMATS = {"mp3", "original"}
YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"}


class MediaFormat(BaseModel):
    format_id: str
    extension: str
    audio_bitrate: int | None = None
    file_size: int | None = None


class MediaResult(BaseModel):
    id: str
    title: str
    artist: str
    duration: int = 0
    thumbnail_url: str | None = None
    source_url: str
    provider: str
    downloadable: bool
    download_url: str | None = None
    formats: list[MediaFormat] = Field(default_factory=list)


class DownloadRequest(BaseModel):
    url: str = Field(min_length=1, max_length=MAX_URL_LENGTH)
    format: str = "mp3"
    authorized: bool = False
    quality: Literal[128, 192, 320] = 192


