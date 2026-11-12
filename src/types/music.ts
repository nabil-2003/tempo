export type AudioFileFormat = "mp3" | "m4a" | "webm" | "opus" | "ogg" | "flac" | "wav" | "aac";

export type DownloadStatus = "pending" | "downloading" | "completed" | "failed";

export type MusicSource = "authorized-download" | "youtube" | "local";

export type DownloadableSong = {
  id: string;
  title: string;
  artist: string;
  duration?: number;
  source: MusicSource;
  sourceUrl: string;
  provider?: string;
  sourceId?: string;
  thumbnailUrl?: string;
  album?: string;
  format: AudioFileFormat | "original";
  downloadUrl?: string;
  downloadable?: boolean;
  quality?: 128 | 192 | 320;
  audioFormats?: { formatId: string; extension: string; bitrate?: number }[];
};

export type LocalSong = Omit<DownloadableSong, "format"> & {
  format: AudioFileFormat;
  audioFile: string;
  thumbnailFile?: string;
  fileSize?: number;
  downloadedAt: string;
  favorite: boolean;
  downloadStatus: "completed";
  lastPlayedAt?: string;
  playCount?: number;
};
