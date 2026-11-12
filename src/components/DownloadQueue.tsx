import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useDownloadQueue } from '@/src/store/downloads';
import { useLibrary } from '@/src/store/library';
import { summarizeBatch } from '@/src/services/downloadSummary';
import type { DownloadItem } from '@/src/types/download';
import { colors } from '@/src/theme/colors';
import { Action, ui } from './LibraryUI';
import { AppIcon, IconButton } from './AppIcon';
const labels: Record<string, string> = { extracting: 'Getting audio information', source_download: 'Downloading source audio', converting: 'Converting to MP3', processing: 'Processing source audio', transferring: 'Saving to phone', verifying: 'Checking offline playback', saved: 'Saved offline' };
export function DownloadProgress({ item: original }: { item: DownloadItem }) {
  const { cancel, retry } = useDownloadQueue();
  const saved = useLibrary(s => s.songs.some(song => song.sourceUrl === original.song.sourceUrl));
  const item: DownloadItem = original.status === 'completed' && !saved ? { ...original, status: 'failed', error: 'Audio is no longer in the Library. Retry to save it again.' } : original;
  const active = item.status === 'downloading';
  const percent = item.phase?.percent;
  const measurable = typeof percent === 'number' && Number.isFinite(percent);
  return <View style={ui.card}>
    <View style={[ui.row, { flexWrap: 'nowrap' }]}>
      <AppIcon name={item.status === 'completed' ? 'checkmark-circle' : item.status === 'failed' ? 'alert-circle-outline' : active ? 'arrow-down-circle-outline' : 'time-outline'} color={item.status === 'completed' ? colors.success : item.status === 'failed' ? '#FB7185' : colors.primary} />
      <View style={{ flex: 1, gap: 5 }}><Text numberOfLines={2} style={ui.buttonText}>{item.song.title}</Text><Text style={item.status === 'failed' ? ui.error : ui.muted}>{item.status === 'failed' ? item.error : item.status === 'completed' ? 'Saved offline' : active ? `${labels[item.phase?.phase ?? 'extracting'] ?? 'Preparing audio'}${measurable ? ` · ${item.phase?.estimated ? '~' : ''}${percent}%` : '…'}` : 'Queued'}</Text>
      {active && item.phase?.bytes ? <Text style={ui.muted}>{(item.phase.bytes / 1e6).toFixed(1)} MB{item.phase.total && item.phase.total > 0 ? ` / ${(item.phase.total / 1e6).toFixed(1)} MB` : ''}</Text> : null}</View>
      {item.status === 'failed' ? <IconButton name="refresh" label={`Retry ${item.song.title}`} onPress={() => retry(item.song)} color={colors.primary} /> : active || item.status === 'pending' ? <IconButton name="close" label={`Cancel ${item.song.title}`} onPress={() => cancel(item.song)} /> : null}
    </View>
    {active && (measurable ? <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: percent }} style={{ backgroundColor: colors.border, height: 5, borderRadius: 4 }}><View style={{ backgroundColor: colors.primary, width: `${Math.max(0, Math.min(100, percent))}%`, height: 5, borderRadius: 4 }} /></View> : <ActivityIndicator color={colors.primary} accessibilityLabel={labels[item.phase?.phase ?? 'extracting']} />)}
  </View>;
}
export function PlaylistProgress({ batchId }: { batchId: string }) {
  const [expanded, setExpanded] = useState(false);
  const { items, batches, retryBatch } = useDownloadQueue();
  const songs = useLibrary(s => s.songs);
  const batch = batches.find(b => b.id === batchId);
  if (!batch) return null;
  const entries = summarizeBatch(batch, items, songs);
  const completed = entries.filter(e => e.state === 'completed').length;
  const failed = entries.filter(e => e.state === 'failed').length;
  const skipped = entries.filter(e => e.skipped || e.state === 'skipped' || e.state === 'unavailable').length;
  const visible = expanded ? entries : entries.filter(e => ["failed", "downloading"].includes(e.state)).slice(0, 4);
  return <View style={ui.card}><Text style={ui.section}>{batch.title}</Text><Text style={ui.buttonText}>{completed} of {entries.length} tracks downloaded</Text><Text style={ui.muted}>{failed} failed · {skipped} skipped / unavailable</Text>{failed > 0 && <Action title="Retry failed tracks" onPress={() => retryBatch(batchId)} />}<Action title={expanded ? "Hide tracks" : `Show all ${entries.length} tracks`} onPress={() => setExpanded(!expanded)} />{visible.map((entry) => {
    const index = entries.indexOf(entry);
    const item = items.find(i => i.song.sourceUrl === entry.song?.sourceUrl);
    return item && ['downloading', 'failed', 'pending'].includes(entry.state) ? <DownloadProgress key={index} item={item} /> : <View key={index} style={{ gap: 3, paddingVertical: 8 }}><Text style={ui.buttonText}>{index + 1}. {entry.song?.title ?? 'Unavailable track'}</Text><Text style={entry.state === 'unavailable' ? ui.error : ui.muted}>{entry.detail}</Text></View>;
  })}</View>;
}
