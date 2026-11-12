import type { DownloadBatch, DownloadItem } from '@/src/types/download';
import type { LocalSong } from '@/src/types/music';
export function summarizeBatch(batch: DownloadBatch, items: DownloadItem[], songs: LocalSong[]) {
  const seen = new Set<string>();
  return batch.entries.map(entry => {
    const url = entry.song?.sourceUrl;
    if (entry.error || !url) return { ...entry, state: 'unavailable', detail: entry.error ?? 'Unavailable track' };
    if (seen.has(url)) return { ...entry, state: 'skipped', detail: 'Duplicate playlist entry skipped' };
    seen.add(url);
    const item = items.find(i => i.song.sourceUrl === url);
    if (songs.some(s => s.sourceUrl === url)) return { ...entry, state: 'completed', detail: entry.skipped ? 'Already downloaded · skipped' : 'Saved offline' };
    if (item?.status === 'completed') return { ...entry, state: 'failed', detail: 'Audio is no longer in the Library. Retry to save it again.' };
    if (item?.status === 'failed') return { ...entry, state: 'failed', detail: item.error ?? 'Download failed' };
    return { ...entry, state: item?.status ?? 'pending', detail: entry.skipped ? 'Already queued' : 'Queued' };
  });
}
