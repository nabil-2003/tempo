import { PlaylistDownload } from "@/src/components/PlaylistDownload";
import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Action, Field, Page, reportError, ui } from '@/src/components/LibraryUI';
import { TrackRow } from '@/src/components/TrackRow';
import { useLibrary } from '@/src/store/library';
import { usePlayer } from '@/src/store/player';

export default function PlaylistScreen() {
  const { id, addSong } = useLocalSearchParams<{ id?: string; addSong?: string }>();
  const { songs, playlists, editPlaylist } = useLibrary();
  const playlist = playlists.find(p => p.id === id);
  const [name, setName] = useState(playlist?.name ?? '');
  const selected = (playlist?.songIds ?? []).map(songId => songs.find(song => song.id === songId)).filter(song => song !== undefined);
  async function save() {
    const title = name.trim();
    if (!title) { Alert.alert('Playlist name', 'Enter a playlist name.'); return; }
    if (id && !playlist) return;
    if (playlist) await editPlaylist(all => all.map(p => p.id === id ? { ...p, name: title } : p));
    else {
      const newId = `playlist_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
      await editPlaylist(all => [...all, { id: newId, name: title, songIds: addSong ? [addSong] : [], createdAt: new Date().toISOString() }]);
      router.replace({ pathname: '/playlist', params: { id: newId } });
    }
  }
  function updateSong(songId: string, remove = false) {
    void editPlaylist(all => all.map(p => p.id === id ? { ...p, songIds: remove ? p.songIds.filter(value => value !== songId) : [...new Set([...p.songIds, songId])], sourceOrder: remove ? p.sourceOrder?.filter(url => url !== songs.find(s => s.id === songId)?.sourceUrl) : p.sourceOrder } : p)).catch(reportError);
  }
  return <Page title={playlist?.name ?? (addSong ? 'Choose playlist' : 'Create playlist')}><Action title="‹ Back" onPress={() => router.back()} />{id && !playlist ? <Text style={ui.muted}>Playlist not found.</Text> : <><PlaylistDownload key={playlist?.id ?? "new"} playlist={playlist} /><Field value={name} onChangeText={setName} placeholder="Playlist name" /><Action title={playlist ? 'Save name' : 'Create playlist'} onPress={() => void save().catch(reportError)} />{playlist ? <><Text style={ui.muted}>{selected.length} saved songs</Text><View style={ui.row}><Action disabled={!selected.length} title="Play" onPress={() => { usePlayer.getState().play(selected[0], selected); router.push('/player'); }} /><Action title="Delete playlist" onPress={() => Alert.alert('Delete playlist?', 'Songs remain in your library.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => void editPlaylist(all => all.filter(p => p.id !== id)).then(() => router.back()).catch(reportError) }])} /></View>{selected.map((song, index) => <View key={song.id}><TrackRow track={song} queue={selected} /><View style={ui.row}><Action title="Remove" onPress={() => updateSong(song.id, true)} />{index > 0 ? <Action title="Move up" onPress={() => void editPlaylist(all => all.map(p => { if (p.id !== id) return p; const songIds = selected.map(s => s.id); [songIds[index - 1], songIds[index]] = [songIds[index], songIds[index - 1]]; return { ...p, songIds, sourceOrder: p.sourceOrder ? [...songIds.map(sid => songs.find(s => s.id === sid)?.sourceUrl).filter((url): url is string => !!url), ...p.sourceOrder.filter(url => !songIds.some(sid => songs.find(s => s.id === sid)?.sourceUrl === url))] : undefined }; })).catch(reportError)} /> : null}</View></View>)}<Text style={ui.section}>Add songs</Text>{songs.filter(song => !playlist.songIds.includes(song.id)).map(song => <Action key={song.id} title={`＋ ${song.title}`} onPress={() => updateSong(song.id)} />)}</> : addSong ? playlists.map(p => <Action key={p.id} title={p.name} onPress={() => void editPlaylist(all => all.map(item => item.id === p.id ? { ...item, songIds: [...new Set([...item.songIds, addSong])] } : item)).then(() => router.back()).catch(reportError)} />) : null}</>}</Page>;
}
