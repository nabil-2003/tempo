import type { MusicProvider, MusicSearchResult } from "./musicProvider";

export class DirectMp3Provider implements MusicProvider {
  readonly name = "Direct audio";

  async search(query: string): Promise<MusicSearchResult[]> {
    if (!/^https?:\/\/.+\.mp3(?:\?.*)?$/i.test(query.trim())) {
      return [];
    }

    const sourceUrl = query.trim();
    const parsed = new URL(sourceUrl);
    if (parsed.username || parsed.password) throw new Error("URLs with login credentials are unsupported.");
    const filename = decodeURIComponent(sourceUrl.split("/").pop() ?? "download");
    const title = filename.replace(/\.mp3(?:\?.*)?$/i, "").replace(/[-_]+/g, " ");
    return [
      {
        id: sourceUrl,
        title,
        artist: "Unknown artist",
        duration: 0,
        source: "authorized-download",
        sourceUrl,
        provider: this.name,
        format: "mp3",
        downloadable: true,
      },
    ];
  }
}

export const directMp3Provider = new DirectMp3Provider();
