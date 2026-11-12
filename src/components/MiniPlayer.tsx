import { IconButton } from './AppIcon';
import { getThumbnailFile } from '@/src/services/musicStorage';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { colors } from '@/src/theme/colors';
import { usePlayer } from '@/src/store/player';
import { AlbumArt } from './AlbumArt';
export function MiniPlayer() {
  const { currentTrack, isPlaying, toggle, next, progress } = usePlayer();
  if (!currentTrack) return null;
  return <View style={styles.container}><Pressable style={styles.details} onPress={() => router.push('/player')}><AlbumArt uri={currentTrack.thumbnailFile ? getThumbnailFile(currentTrack.thumbnailFile).uri : undefined} color={colors.primary} accent={colors.secondary} size={48} /><View style={{ flex: 1 }}><Text numberOfLines={1} style={styles.title}>{currentTrack.title}</Text><Text numberOfLines={1} style={styles.artist}>{currentTrack.artist}</Text></View></Pressable><IconButton name={isPlaying ? "pause" : "play"} label={isPlaying ? "Pause" : "Play"} color={colors.text} onPress={toggle} /><IconButton name="play-skip-forward" label="Next song" onPress={next} color={colors.text} /><View style={[styles.progress, { width: `${Math.max(0, Math.min(1, progress)) * 100}%` }]} /></View>;
}
const styles = StyleSheet.create({ container: { height: 66, marginHorizontal: 12, marginBottom: 8, padding: 8, gap: 0, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceLight, borderRadius: 12, overflow: 'hidden' }, details: { flex: 1, flexDirection: 'row', gap: 10, alignItems: 'center' }, title: { color: colors.text, fontWeight: '700', fontSize: 13 }, artist: { color: colors.textSecondary, fontSize: 11 }, control: { color: colors.text, fontSize: 20, minWidth: 24 }, progress: { position: 'absolute', bottom: 0, left: 0, height: 2, backgroundColor: colors.primary } });
