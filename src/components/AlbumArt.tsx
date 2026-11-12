import { AppIcon } from './AppIcon';
import { Image, StyleSheet, View } from 'react-native';

type AlbumArtProps = {
  uri?: string;
  color: string;
  accent: string;
  size?: number;
  icon?: string;
};

export function AlbumArt({ uri, color, accent, size = 68 }: AlbumArtProps) {
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size * 0.16 }} />;
  return (
    <View style={[styles.art, { width: size, height: size, backgroundColor: color, borderRadius: size * 0.16 }]}>
      <View style={[styles.orbit, { width: size * 0.65, height: size * 0.65, borderColor: accent }]} />
      <AppIcon name="musical-notes" size={size * 0.4} color={accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  art: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  orbit: { position: 'absolute', borderWidth: 2, borderRadius: 999, transform: [{ rotate: '35deg' }] },
  icon: { fontWeight: '700' },
});
