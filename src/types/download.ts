import type { DownloadableSong, DownloadStatus } from './music';
export type DownloadPhase = { phase: string; percent?: number | null; bytes?: number; total?: number; estimated?: boolean };
export type DownloadItem = {
  song: DownloadableSong; status: DownloadStatus; progress: number;
  phase?: DownloadPhase; error?: string; bytesWritten?: number; totalBytes?: number;
};
export type DownloadProgressCallback = (progress: number, bytesWritten?: number, totalBytes?: number) => void;
export type PlaylistEntry = { song?: DownloadableSong; error?: string; skipped?: boolean };
export type DownloadBatch = { id: string; title: string; entries: PlaylistEntry[] };
