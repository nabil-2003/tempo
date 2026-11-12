import { AppIcon, IconButton } from './AppIcon';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { LocalSong } from '@/src/types/music';
import { usePlayer } from '@/src/store/player';
import { colors } from '@/src/theme/colors';
import { AlbumArt } from './AlbumArt';
import { getThumbnailFile, toggleLocalFavorite, removeLocalSong } from '@/src/services/musicStorage';
import { reportError } from '@/src/services/errors';

export function TrackRow({ track, index, compact = false, queue }: { track: LocalSong; index?: number; compact?: boolean; queue?: LocalSong[] }) {
  const play = usePlayer(state => state.play);
  const currentId = usePlayer(state => state.currentTrack?.id);
  const isPlaying = usePlayer(state => state.isPlaying);
  const active = currentId === track.id;
  function options() {
    Alert.alert(track.title, track.artist, [
      { text: track.favorite ? 'Unfavorite' : 'Favorite', onPress: () => void toggleLocalFavorite(track.id).catch(reportError) },
      { text: 'Playlist / delete', onPress: () => Alert.alert(track.title, 'Manage saved song', [
        { text: 'Add to playlist', onPress: () => router.push({ pathname: '/playlist', params: { addSong: track.id } }) },
        { text: 'Delete', style: 'destructive', onPress: () => Alert.alert('Delete song?', 'This removes the saved audio and artwork from Tempo.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => void removeLocalSong(track.id).catch(reportError) }]) },
        { text: 'Cancel', style: 'cancel' },
      ]) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }
  return <View style={[styles.row, active && { backgroundColor: colors.surfaceLight, borderRadius: 14, paddingLeft: 8 }]}>{index !== undefined && <Text style={styles.index}>{index + 1}</Text>}<Pressable style={styles.playRow} accessibilityLabel={`Play ${track.title}`} onPress={() => play(track, queue)}><AlbumArt uri={track.thumbnailFile ? getThumbnailFile(track.thumbnailFile).uri : undefined} color={colors.primary} accent={colors.secondary} size={compact ? 50 : 56} /><View style={styles.details}><View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>{active ? <AppIcon name={isPlaying ? "musical-notes" : "pause-circle-outline"} color={colors.primary} size={16} /> : null}<Text numberOfLines={1} style={[styles.title, { flex: 1 }, active && { color: "#C4B5FD" }]}>{track.title}</Text></View><Text numberOfLines={1} style={styles.subtitle}>{track.artist}{track.album ? ` · ${track.album}` : ''}{active ? isPlaying ? ' · Playing' : ' · Paused' : ''}{track.favorite ? ' · Favorite' : ''}</Text></View></Pressable><IconButton name="ellipsis-horizontal" label={`Options for ${track.title}`} onPress={options} /></View>;
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }, playRow: { flexDirection: 'row', gap: 12, flex: 1, alignItems: 'center' }, index: { color: colors.textSecondary, width: 18 }, details: { flex: 1, gap: 4 }, title: { color: colors.text, fontSize: 15, fontWeight: '700' }, subtitle: { color: colors.textSecondary, fontSize: 12 }, more: { color: colors.textSecondary, padding: 8 } });
