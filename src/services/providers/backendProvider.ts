import type { PlaylistEntry } from "@/src/types/download";
import { startEmbeddedEngine } from "@/src/services/embeddedEngine";
import type { MusicProvider, MusicSearchResult } from "./musicProvider";

export const backendUrl = (
  process.env.EXPO_PUBLIC_BACKEND_URL ?? "http://10.0.2.2:8000"
).replace(/\/$/, "");

export async function getBackendUrl() {
  if (process.env.EXPO_PUBLIC_DOWNLOAD_ENGINE === "server") return backendUrl;
  const embedded = startEmbeddedEngine();
  if (embedded) return embedded;
  if (process.env.EXPO_PUBLIC_BACKEND_URL) return backendUrl;
  throw new Error("Install the Tempo APK to search by name on-device. Expo Go cannot include the bundled Python engine.");
}

export type BackendResult = {
  id: string;
  title: string;
  artist: string;
  duration: number;
  thumbnail_url?: string;
  source_url: string;
  provider: string;
  downloadable: boolean;
  formats?: { format_id: string; extension: string; audio_bitrate?: number }[];
};

export class BackendProvider implements MusicProvider {
  readonly name = "Tempo backend";

  async search(query: string, signal?: AbortSignal): Promise<MusicSearchResult[]> {
    if (!query.trim() || query.includes("://")) throw new Error("Enter a song or artist name.");
    const url = await getBackendUrl();
    const response = await fetch(
      `${url}/api/search?query=${encodeURIComponent(query.trim())}`,
      { signal },
    );
    const payload = (await response.json()) as unknown;
    if (!response.ok) {
      const detail =
        typeof payload === "object" &&
        payload !== null &&
        "detail" in payload &&
        typeof payload.detail === "string"
          ? payload.detail
          : "Media search failed.";
      throw new Error(detail);
    }
    const entries = Array.isArray(payload) ? payload : payload && typeof payload === "object" && "source_url" in payload ? [payload] : null;
    if (!entries) {
      throw new Error("The backend returned an invalid search response.");
    }

    return (entries as BackendResult[]).map(mapMedia);
  }
}

export function mapMedia(item: BackendResult): MusicSearchResult {
 return ({
      id: item.id,
      title: item.title,
      artist: item.artist,
      duration: item.duration,
      source: "authorized-download" as const,
      sourceUrl: item.source_url,
      provider: item.provider,
      sourceId: item.id,
      thumbnailUrl: item.thumbnail_url,
      audioFormats: item.formats?.map((format) => ({ formatId: format.format_id, extension: format.extension, bitrate: format.audio_bitrate })),
      downloadable: item.downloadable,
      format: "original" as const,
    });
}

export const backendProvider = new BackendProvider();

export async function resolvePlaylist(source: string, signal?: AbortSignal): Promise<{ sourceUrl: string; title: string; entries: PlaylistEntry[] }> {
  const url = await getBackendUrl();
  const response = await fetch(`${url}/api/playlist?url=${encodeURIComponent(source.trim())}`, { signal });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : response.status === 404 ? 'Playlist support needs the updated engine. Use the local Python server for the live preview.' : 'Cannot resolve this playlist.');
  if (!Array.isArray(data.tracks)) throw new Error('Invalid playlist response.');
  return { sourceUrl: String(data.source_url || source.trim()), title: String(data.title), entries: data.tracks.map((entry: { media?: BackendResult; error?: string }) => ({ song: entry.media ? mapMedia(entry.media) : undefined, error: entry.error })) };
}

export type PlaylistSearchResult = { id: string; title: string; artist: string; sourceUrl: string; thumbnailUrl?: string; trackCount?: number };
export async function searchPlaylists(query: string, signal?: AbortSignal): Promise<PlaylistSearchResult[]> {
  if (!query.trim() || query.includes('://')) throw new Error('Enter a playlist or artist name.');
  const url = await getBackendUrl();
  const response = await fetch(`${url}/api/playlists/search?query=${encodeURIComponent(query.trim())}`, { signal });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Playlist search failed. Update the download engine and retry.');
  if (!Array.isArray(data)) throw new Error('Invalid playlist search response.');
  return data.map(item => ({ id: item.id, title: item.title, artist: item.artist, sourceUrl: item.source_url, thumbnailUrl: item.thumbnail_url, trackCount: item.track_count }));
}
