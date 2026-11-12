import type { DownloadableSong } from "@/src/types/music";

export type MusicSearchResult = DownloadableSong & {
  duration: number;
};

export interface MusicProvider {
  readonly name: string;
  search(query: string): Promise<MusicSearchResult[]>;
}
