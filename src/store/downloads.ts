import { create } from 'zustand';
import { downloadSong, cancelDownload } from '@/src/services/downloadManager';
import { readState, writeState } from '@/src/services/musicStorage';
import { useLibrary } from '@/src/store/library';
import { usePlayer } from '@/src/store/player';
import type { DownloadableSong } from '@/src/types/music';
import type { DownloadBatch, DownloadItem, PlaylistEntry } from '@/src/types/download';

type State = {
  items: DownloadItem[]; batches: DownloadBatch[]; error?: string;
  enqueue: (song: DownloadableSong) => void;
  enqueueBatch: (title: string, entries: PlaylistEntry[], playlistId: string) => Promise<void>;
  cancel: (song: DownloadableSong) => void;
  retry: (song: DownloadableSong) => void;
  retryBatch: (id: string) => void;
  hydrate: () => Promise<void>;
};
let running = false;
let hydrated = false;
let writes: Promise<unknown> = Promise.resolve();
const persist = () => {
  const { items, batches } = useDownloadQueue.getState();
  writes = writes.then(() => writeState('downloads.json', { items, batches })).catch(error => useDownloadQueue.setState({ error: `Queue could not be saved: ${String(error)}` }));
};
export async function reconcilePlaylistDownloads() {
  const library = useLibrary.getState();
  await library.editPlaylist(all => all.map(p => {
    if (!p.sourceOrder) return p;
    const ordered = p.sourceOrder.map(url => library.songs.find(s => s.sourceUrl === url)?.id).filter((id): id is string => !!id);
    const tracked = new Set(p.sourceOrder);
    const manual = p.songIds.filter(id => !tracked.has(library.songs.find(s => s.id === id)?.sourceUrl ?? ''));
    return { ...p, songIds: [...new Set([...ordered, ...manual])] };
  }));
}
async function pump() {
  if (running) return;
  running = true;
  try {
    while (true) {
      const item = useDownloadQueue.getState().items.find(i => i.status === 'pending');
      if (!item) break;
      const url = item.song.sourceUrl;
      const update = (patch: Partial<DownloadItem>) => useDownloadQueue.setState(s => ({ items: s.items.map(i => i.song.sourceUrl === url ? { ...i, ...patch } : i) }));
      update({ status: 'downloading', error: undefined }); persist();
      try {
        // A queued track may have been imported/saved while another track was downloading.
        if (!useLibrary.getState().songs.some(s => s.sourceUrl === url)) {
          await downloadSong(item.song, (progress, bytesWritten, totalBytes) => update({ progress, bytesWritten, totalBytes }), phase => update({ phase }));
        }
        await useLibrary.getState().refresh();
        if (useLibrary.getState().error) throw new Error(useLibrary.getState().error);
        usePlayer.getState().setLibrary(useLibrary.getState().songs);
        await reconcilePlaylistDownloads();
        update({ status: 'completed', progress: 100, phase: { phase: 'saved', percent: 100 } });
      } catch (error) {
        update({ status: 'failed', error: error instanceof Error ? error.message : 'Download failed.' });
      }
      persist();
    }
  } finally { running = false; }
}
export const useDownloadQueue = create<State>((set, get) => ({
  items: [], batches: [],
  hydrate: async () => {
    if (hydrated) return;
    hydrated = true;
    try {
      const saved = await readState<{ items: DownloadItem[]; batches: DownloadBatch[] }>('downloads.json', { items: [], batches: [] });
      if (!Array.isArray(saved.items) || !Array.isArray(saved.batches) || !saved.items.every(i => i.song && typeof i.song.sourceUrl === 'string')) throw new Error('Invalid queue metadata; existing file preserved.');
      // Keep new actions enqueued while disk hydration was in flight.
      const current = get();
      set({ items: [...saved.items.filter(i => !current.items.some(c => c.song.sourceUrl === i.song.sourceUrl)).map(i => i.status === 'pending' || i.status === 'downloading' ? { ...i, status: 'failed' as const, error: 'Interrupted when Tempo closed. Tap retry.' } : i), ...current.items], batches: [...saved.batches.filter(b => !current.batches.some(c => c.id === b.id)), ...current.batches] });
      await reconcilePlaylistDownloads();
    } catch (error) { set({ error: String(error) }); }
  },
  enqueue: song => {
    if (useLibrary.getState().songs.some(s => s.sourceUrl === song.sourceUrl)) return;
    const previous = get().items.find(i => i.song.sourceUrl === song.sourceUrl);
    if (previous && ['pending', 'downloading'].includes(previous.status)) return;
    set(s => ({ items: [...s.items.filter(i => i.song.sourceUrl !== song.sourceUrl), { song, status: 'pending', progress: 0 }] }));
    persist(); void pump();
  },
  enqueueBatch: async (title, entries, playlistId) => {
    const seen = new Set<string>();
    entries = entries.map(entry => {
      const url = entry.song?.sourceUrl;
      const skipped = !!url && (seen.has(url) || useLibrary.getState().songs.some(s => s.sourceUrl === url) || get().items.some(i => i.song.sourceUrl === url && ['pending', 'downloading'].includes(i.status)));
      if (url) seen.add(url);
      return { ...entry, skipped };
    });
    const batch = { id: `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, title, entries };
    const order = [...new Set(entries.flatMap(e => e.song && !e.error ? [e.song.sourceUrl] : []))];
    await useLibrary.getState().editPlaylist(all => all.map(p => p.id === playlistId ? { ...p, sourceOrder: order, downloadBatchId: batch.id } : p));
    set(s => ({ batches: [...s.batches, batch] }));
    await reconcilePlaylistDownloads();
    for (const entry of entries) if (entry.song && !entry.error && entry.song.downloadable !== false) get().enqueue(entry.song);
    persist();
  },
  cancel: song => {
    const item = get().items.find(i => i.song.sourceUrl === song.sourceUrl);
    if (item?.status === 'downloading') cancelDownload(song.sourceUrl);
    else if (item?.status === 'pending') { set(s => ({ items: s.items.map(i => i === item ? { ...i, status: 'failed', error: 'Download cancelled.' } : i) })); persist(); }
  },
  retry: song => get().enqueue(song),
  retryBatch: id => {
    for (const entry of get().batches.find(b => b.id === id)?.entries ?? []) {
      if (entry.song && !entry.error && get().items.some(i => i.song.sourceUrl === entry.song!.sourceUrl && (i.status === 'failed' || (i.status === 'completed' && !useLibrary.getState().songs.some(s => s.sourceUrl === i.song.sourceUrl))))) get().enqueue(entry.song);
    }
  },
}));
