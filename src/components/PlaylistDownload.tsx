import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Keyboard, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { resolvePlaylist, searchPlaylists, type PlaylistSearchResult } from '@/src/services/providers/backendProvider';
import { useDownloadQueue } from '@/src/store/downloads';
import { useLibrary } from '@/src/store/library';
import type { Playlist } from '@/src/types/library';
import { colors } from '@/src/theme/colors';
import { Action, reportError, ui } from './LibraryUI';
import { AppIcon, IconButton } from './AppIcon';
import { PlaylistProgress } from './DownloadQueue';
function playlistId() { return `playlist_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }
type ResolvedPlaylist = Awaited<ReturnType<typeof resolvePlaylist>>;
export function PlaylistDownload({ playlist }: { playlist?: Playlist }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaylistSearchResult[]>([]);
  const [busy, setBusy] = useState<'search' | 'resolve'>();
  const [error, setError] = useState<string>();
  const [resolved, setResolved] = useState<ResolvedPlaylist>();
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function lookup(source?: string) {
    if (busy) return;
    Keyboard.dismiss();
    setBusy(source ? 'resolve' : 'search'); setError(undefined);
    const request = new AbortController();
    controller.current = request;
    const timer = setTimeout(() => request.abort(), 100000);
    try {
      if (source) setResolved(await resolvePlaylist(source, request.signal));
      else {
        const found = await searchPlaylists(query, request.signal);
        setResults(found);
        if (!found.length) setError('No playlists found. Try another playlist or artist name.');
      }
    } catch (reason) {
      setError(request.signal.aborted ? 'Playlist lookup cancelled or timed out.' : reason instanceof Error ? reason.message : 'Playlist search failed.');
    } finally { clearTimeout(timer); setBusy(undefined); }
  }
  async function enqueue(quality: 'original' | 128 | 192 | 320, snapshot: ResolvedPlaylist) {
    const library = useLibrary.getState();
    const id = playlist?.id ?? playlistId();
    await library.editPlaylist(all => playlist ? all.map(p => p.id === id ? { ...p, sourceUrl: snapshot.sourceUrl } : p) : [...all, { id, name: snapshot.title, sourceUrl: snapshot.sourceUrl, songIds: [], createdAt: new Date().toISOString() }]);
    await useDownloadQueue.getState().enqueueBatch(snapshot.title, snapshot.entries.map(e => ({ ...e, song: e.song ? { ...e.song, format: quality === 'original' ? 'original' : 'mp3', quality: quality === 'original' ? undefined : quality } : undefined })), id);
    if (!playlist) router.replace({ pathname: '/playlist', params: { id } });
  }
  function choose(quality: 'original' | 128 | 192 | 320) {
    const snapshot = resolved;
    setResolved(undefined);
    if (!snapshot) return;
    Alert.alert('Confirm playlist download permission', 'Only save tracks you own, are licensed to download, or are otherwise authorized to save. Being public or appearing in search does not grant permission.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'I am authorized', onPress: () => void enqueue(quality, snapshot).catch(reportError) },
    ]);
  }
  return <View style={ui.card}>
    <View style={ui.row}><AppIcon name="albums-outline" color={colors.primary} /><Text style={ui.section}>Find a playlist</Text></View>
    <Text style={ui.muted}>Search by playlist or artist name. Choose a result to download its tracks; saved and queued songs are skipped.</Text>
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, borderRadius: 14, paddingLeft: 12 }}>
      <AppIcon name="search" size={20} />
      <TextInput accessibilityLabel="Search playlists" value={query} onChangeText={setQuery} autoCorrect={false} returnKeyType="search" onSubmitEditing={() => void lookup()} placeholder="Search playlists or artists" placeholderTextColor={colors.textSecondary} style={[ui.input, { flex: 1, backgroundColor: colors.background }]} />
      <IconButton name={busy ? 'close' : 'arrow-forward-circle'} label={busy ? 'Cancel playlist lookup' : 'Search playlists'} onPress={() => busy ? controller.current?.abort() : void lookup()} color={colors.primary} />
    </View>
    {busy ? <View style={ui.row}><ActivityIndicator color={colors.primary} /><Text style={ui.muted}>{busy === 'search' ? 'Searching playlists…' : 'Getting playlist tracks…'}</Text></View> : null}
    {error ? <Text style={ui.error}>{error}</Text> : null}
    {results.map(result => <View key={result.id} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 8 }}>
      {result.thumbnailUrl ? <Image source={{ uri: result.thumbnailUrl }} style={{ width: 56, height: 56, borderRadius: 10 }} /> : <AppIcon name="albums" color={colors.primary} size={36} />}
      <View style={{ flex: 1, gap: 5 }}><Text numberOfLines={2} style={ui.buttonText}>{result.title}</Text><Text style={ui.muted}>{result.artist}{typeof result.trackCount === 'number' ? ` · ${result.trackCount} tracks` : ''}</Text></View>
      <Pressable disabled={!!busy} accessibilityRole="button" accessibilityLabel={`Download playlist ${result.title}`} onPress={() => void lookup(result.sourceUrl)} style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', opacity: busy ? .4 : 1 }}><AppIcon name="download-outline" color={colors.primary} /></Pressable>
    </View>)}
    <Text style={ui.muted}>Search results do not grant download permission.</Text>
    {playlist?.sourceUrl ? <Action title="Download this playlist again" disabled={!!busy} onPress={() => void lookup(playlist.sourceUrl)} /> : null}
    {playlist?.downloadBatchId ? <PlaylistProgress batchId={playlist.downloadBatchId} /> : null}
    <Modal visible={!!resolved} transparent animationType="slide" onRequestClose={() => setResolved(undefined)}><View style={{ flex: 1, backgroundColor: '#000A', justifyContent: 'flex-end' }}><View style={[ui.card, { padding: 24, paddingBottom: 40, borderRadius: 24 }]}><Text style={ui.heading}>Choose audio quality</Text><Text style={ui.muted}>{resolved?.title} · {resolved?.entries.length} tracks</Text>{([{ label: 'Original', quality: 'original', detail: 'Keep source audio · no conversion' }, { label: 'Low', quality: 128, detail: 'MP3 · 128 kbps' }, { label: 'Medium', quality: 192, detail: 'MP3 · 192 kbps' }, { label: 'High', quality: 320, detail: 'MP3 · 320 kbps' }] as const).map(option => <Pressable key={option.label} accessibilityRole="button" onPress={() => choose(option.quality)} style={ui.button}><Text style={ui.buttonText}>{option.label}</Text><Text style={ui.muted}>{option.detail}</Text></Pressable>)}<Text style={ui.muted}>Source quality limits apply. Higher MP3 bitrate does not restore missing audio detail.</Text><Action title="Cancel" onPress={() => setResolved(undefined)} /></View></View></Modal>
  </View>;
}
