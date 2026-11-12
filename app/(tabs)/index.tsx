import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useLibrary } from '@/src/store/library';
import { usePlayer } from '@/src/store/player';
import { TrackRow } from '@/src/components/TrackRow';
import { Action, EmptyLibrary, Page, ui } from '@/src/components/LibraryUI';

export default function HomeScreen() {
  const { songs, playlists } = useLibrary();
  const currentTrack = usePlayer(state => state.currentTrack);
  const sections = [
    { title: 'Recently played', songs: [...songs].filter(song => song.lastPlayedAt).sort((a,b) => (b.lastPlayedAt ?? '').localeCompare(a.lastPlayedAt ?? '')).slice(0, 5) },
    { title: 'Favorites', songs: songs.filter(song => song.favorite).slice(0, 5) },
    { title: 'Recently added', songs: [...songs].sort((a,b) => b.downloadedAt.localeCompare(a.downloadedAt)).slice(0,5) },
  ];
  return <Page title="What do you want to hear?">{!songs.length ? <EmptyLibrary /> : null}{currentTrack ? <Action title={`Continue listening · ${currentTrack.title}`} onPress={() => { usePlayer.getState().play(); router.push('/player'); }} /> : null}{sections.filter(section => section.songs.length).map(section => <View key={section.title}><Text style={ui.section}>{section.title}</Text>{section.songs.map(song => <TrackRow key={song.id} track={song} />)}</View>)}{playlists.length ? <Text style={ui.section}>Your playlists</Text> : null}{playlists.map(playlist => <Action key={playlist.id} title={`${playlist.name} · ${playlist.songIds.filter(id => songs.some(song => song.id === id)).length} songs`} onPress={() => router.push({ pathname: '/playlist', params: { id: playlist.id } })} />)}<Action title="Create playlist" onPress={() => router.push('/playlist')} /></Page>;
}
