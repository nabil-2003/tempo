import { create } from 'zustand';
import { listLocalSongs, readState, writeState, getStorageUsage } from '@/src/services/musicStorage';
import type { LocalSong } from '@/src/types/music';
import type { Playlist } from '@/src/types/library';

type LibraryState = {
  importing: boolean; songs: LocalSong[]; playlists: Playlist[]; error?: string; usage: number;
  refresh: () => Promise<void>;
  editPlaylist: (operation: (playlists: Playlist[]) => Playlist[]) => Promise<void>;
};
let editing: Promise<unknown> = Promise.resolve();
export const useLibrary = create<LibraryState>((set, get) => ({
  importing: false, songs: [], playlists: [], usage: 0,
  refresh: async () => {
    try {
      const songs = await listLocalSongs();
      const raw = await readState<Playlist[]>('playlists.json', []);
      if (!Array.isArray(raw) || !raw.every(p => typeof p.id === 'string' && typeof p.name === 'string' && Array.isArray(p.songIds) && p.songIds.every(id => typeof id === 'string'))) throw new Error('Invalid playlist metadata. Existing data was preserved.');
      set({ songs, playlists: raw, usage: getStorageUsage(), error: undefined });
    } catch (error) { set({ error: String(error) }); }
  },
  editPlaylist: (operation) => {
    const run = editing.then(async () => {
      const playlists = operation(get().playlists);
      await writeState('playlists.json', playlists);
      set({ playlists });
    });
    editing = run.catch(() => undefined);
    return run;
  },
}));
