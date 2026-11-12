import { useState } from 'react';
import { Text } from 'react-native';
import { router } from 'expo-router';
import { useLibrary } from '@/src/store/library';
import { TrackRow } from '@/src/components/TrackRow';
import { Action, Field, Page, ui } from '@/src/components/LibraryUI';

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const songs = useLibrary(state => state.songs);
  const results = query.trim() ? songs.filter(song => `${song.title} ${song.artist} ${song.album ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())) : [];
  return <Page title="Search"><Field value={query} onChangeText={setQuery} placeholder="Search title, artist or album" /><Text style={ui.section}>On this device</Text>{results.map(song => <TrackRow key={song.id} track={song} queue={results} />)}{!results.length ? <Text style={ui.muted}>{query ? 'No local songs match your search.' : 'Search your offline library.'}</Text> : null}<Text style={ui.section}>External media</Text><Text style={ui.muted}>Search songs and artists using the Python engine bundled in the Tempo APK.</Text><Action title="Search online music" onPress={() => router.push({ pathname: '/downloads', params: { query } })} /></Page>;
}
