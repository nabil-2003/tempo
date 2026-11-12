import { probeDuration } from "@/src/services/importMusic";
import { prepareDownload, discardPreparedDownload } from "@/src/services/downloadPreparation";
import { File } from "expo-file-system";

import {
  findLocalSongBySource,
  assertStorageSpace,
  getAudioFile,
  getMusicDirectory,
  getThumbnailDirectory,
  saveLocalSong,
} from "@/src/services/musicStorage";
import type { DownloadPhase, DownloadProgressCallback } from "@/src/types/download";
import type { AudioFileFormat, DownloadableSong, LocalSong } from "@/src/types/music";

const activeDownloads = new Map<string, AbortController>();

function createId() {
  return `song_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function isSupportedAudio(file: File, format: AudioFileFormat) {
  if (!file.exists || file.size < 3) return false;
  const handle = file.open();
  try {
    const header = await handle.readBytes(12);
    const matches = (signature: number[], offset = 0) => signature.every((byte, index) => header[index + offset] === byte);
    if (format === "m4a") return matches([0x66, 0x74, 0x79, 0x70], 4);
    if (format === "webm") return matches([0x1a, 0x45, 0xdf, 0xa3]);
    if (format === "ogg" || format === "opus") return matches([0x4f, 0x67, 0x67, 0x53]);
    if (format === "flac") return matches([0x66, 0x4c, 0x61, 0x43]);
    if (format === "wav") return matches([0x52, 0x49, 0x46, 0x46]) && matches([0x57, 0x41, 0x56, 0x45], 8);
    return (header[0] === 0x49 && header[1] === 0x44 && header[2] === 0x33) ||
      (header[0] === 0xff && (header[1] & 0xe0) === 0xe0);
  } finally { handle.close(); }
}

async function downloadThumbnail(song: DownloadableSong, id: string) {
  if (!song.thumbnailUrl) {
    return undefined;
  }

  const file = new File(getThumbnailDirectory(), `${id}.jpg`);
  const downloaded = await File.downloadFileAsync(song.thumbnailUrl, file, {
    idempotent: true,
    signal: activeDownloads.get(song.sourceUrl)?.signal,
  });
  return downloaded.exists ? `thumbnails/${id}.jpg` : undefined;
}

export async function downloadSong(
  song: DownloadableSong,
  onProgress?: DownloadProgressCallback,
  onPhase?: (phase: DownloadPhase) => void,
): Promise<LocalSong> {
  if (activeDownloads.has(song.sourceUrl)) throw new Error("This song is already downloading.");
  const controller = new AbortController();
  activeDownloads.set(song.sourceUrl, controller);
  const id = createId();
  const temporary = new File(getMusicDirectory(), `${id}.part`);
  let final: File | undefined;
  let thumbnailFile: string | undefined;
  let preparedId: string | undefined;
  let storageError: Error | undefined;
  try {
  if (song.downloadable === false) throw new Error("This source is unavailable for download.");
  const existing = await findLocalSongBySource(song.sourceUrl);
  if (existing) {
    throw new Error("This song is already downloaded.");
  }
    assertStorageSpace(5 * 1024 * 1024);
    onProgress?.(0);
    onPhase?.({ phase: "extracting", percent: null });
    const prepared = song.provider === 'Direct audio'
      ? { id: '', extension: song.format === 'original' ? 'mp3' as const : song.format, url: song.sourceUrl }
      : await prepareDownload(song, controller.signal, onPhase);
    preparedId = prepared.id;
    const downloadUrl = prepared.url;
    const audioFile = `musics/${id}.${prepared.extension}`;
    final = getAudioFile(audioFile);
    onPhase?.({ phase: "transferring", percent: null });
    const downloaded = await File.downloadFileAsync(downloadUrl, temporary, {
      idempotent: true,
      signal: controller.signal,
      onProgress: ({ bytesWritten, totalBytes }) => {
        try { assertStorageSpace(Math.max(0, totalBytes - bytesWritten)); }
        catch (error) { storageError = error instanceof Error ? error : new Error("Not enough storage space."); controller.abort(); return; }
        onPhase?.({ phase: "transferring", bytes: bytesWritten, total: totalBytes, percent: totalBytes > 0 ? Math.min(100, Math.round(bytesWritten / totalBytes * 100)) : null });
        onProgress?.(totalBytes > 0 ? Math.round((bytesWritten / totalBytes) * 100) : 0, bytesWritten, totalBytes);
      },
    });

    if (controller.signal.aborted) throw new Error("Download cancelled.");
    if (!await isSupportedAudio(downloaded, prepared.extension)) {
      throw new Error("The provider returned an unsupported or empty audio file.");
    }
    await downloaded.move(final, { overwrite: true });
    onPhase?.({ phase: "verifying", percent: null });
    const duration = await probeDuration(final.uri);
    try {
      thumbnailFile = await downloadThumbnail(song, id);
    } catch { /* Artwork failure must not discard downloaded audio. */ }
    if (controller.signal.aborted) throw new Error("Download cancelled.");
    const metadata: LocalSong = {
      ...song,
      duration,
      id,
      audioFile,
      format: prepared.extension,
      thumbnailFile,
      fileSize: final.size,
      downloadedAt: new Date().toISOString(),
      favorite: false,
      downloadStatus: "completed",
    };
    await saveLocalSong(metadata);
    onProgress?.(100);
    return metadata;
  } catch (error) {
    if (temporary.exists) {
      temporary.delete();
    }
    if (final?.exists) {
      final.delete();
    }
    const artwork = new File(getThumbnailDirectory(), `${id}.jpg`);
    if (artwork.exists) artwork.delete();
    const message = error instanceof Error ? error.message : "Download failed.";
    const helpful = /space|ENOSPC/i.test(message) ? "Not enough storage space. Free up space and retry." : /503/.test(message) ? "The backend needs FFmpeg and ffprobe installed." :
      /422/.test(message) ? "This media is unavailable, unsupported, restricted, or protected. Try another authorized source." :
      /504/.test(message) ? "Conversion timed out. Try a shorter recording." :
      /timeout|timed out/i.test(message) ? "The audio transfer timed out. Check your connection and retry." :
      /network|connect|fetch/i.test(message) ? "Cannot reach Tempo backend. Check the server and EXPO_PUBLIC_BACKEND_URL." : message;
    if (storageError) throw storageError;
    throw controller.signal.aborted ? new Error("Download cancelled.") : new Error(helpful);
  } finally {
    if (preparedId) await discardPreparedDownload(preparedId);
    activeDownloads.delete(song.sourceUrl);
  }
}

export function cancelDownload(sourceUrl: string) {
  activeDownloads.get(sourceUrl)?.abort();
}

export function isDownloading(sourceUrl: string) {
  return activeDownloads.has(sourceUrl);
}
