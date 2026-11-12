import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useLibrary } from '@/src/store/library';
import { TrackRow } from '@/src/components/TrackRow';
import { Action, EmptyLibrary, Field, Page, runImport, ui } from '@/src/components/LibraryUI';

export default function LibraryScreen() {
  const { songs, playlists, usage, refresh } = useLibrary();
  const [query, setQuery] = useState('');
  const [favorites, setFavorites] = useState(false);
  const sorts = ['date', 'title', 'artist', 'duration'] as const;
  const [sort, setSort] = useState<number>(0);
  const results = songs.filter(song => (!favorites || song.favorite) && `${song.title} ${song.artist} ${song.album ?? ''}`.toLowerCase().includes(query.toLowerCase())).sort((a,b) => {
    const key = sorts[sort];
    return key === 'duration' ? (b.duration ?? 0) - (a.duration ?? 0) : key === 'date' ? b.downloadedAt.localeCompare(a.downloadedAt) : a[key].localeCompare(b[key]);
  });
  return <Page title="Your Library"><Text style={ui.muted}>{songs.length} songs · {(usage / 1e6).toFixed(1)} MB</Text><View style={ui.row}><Action title="Import MP3" onPress={runImport} /><Action title="Refresh" onPress={() => void refresh()} /><Action title={favorites ? 'Show all' : `Favorites (${songs.filter(song => song.favorite).length})`} onPress={() => setFavorites(!favorites)} /><Action title={`Sort: ${sorts[sort]}`} onPress={() => setSort((sort + 1) % sorts.length)} /></View><Field value={query} onChangeText={setQuery} placeholder="Search title, artist or album" />{!songs.length ? <EmptyLibrary /> : results.length ? results.map(song => <TrackRow key={song.id} track={song} queue={results} />) : <Text style={ui.muted}>No matching songs.</Text>}<Text style={ui.section}>Playlists</Text>{playlists.map(playlist => <Action key={playlist.id} title={playlist.name} onPress={() => router.push({ pathname: '/playlist', params: { id: playlist.id } })} />)}<Action title="Create playlist" onPress={() => router.push('/playlist')} /></Page>;
}
