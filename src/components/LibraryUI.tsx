import { Image, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { colors } from '@/src/theme/colors';
import { MiniPlayer } from './MiniPlayer';
import { importMusic } from '@/src/services/importMusic';
import { recoverLibrary } from '@/src/services/musicStorage';
import { useLibrary } from '@/src/store/library';

import { reportError } from '@/src/services/errors';
export { reportError } from '@/src/services/errors';
export const runImport = () => {
  if (useLibrary.getState().importing) return;
  useLibrary.setState({ importing: true });
  void importMusic().catch(reportError).finally(() => useLibrary.setState({ importing: false }));
};
export function Action({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[ui.button, disabled && { opacity: 0.4 }]}><Text style={ui.buttonText}>{title}</Text></Pressable>;
}
export function Field({ value, onChangeText, placeholder }: { value: string; onChangeText: (value: string) => void; placeholder: string }) {
  return <TextInput style={ui.input} placeholder={placeholder} placeholderTextColor={colors.textSecondary} value={value} onChangeText={onChangeText} />;
}
export function Page({ title, children }: { title: string; children: React.ReactNode }) {
  const error = useLibrary(state => state.error);
  const importing = useLibrary(state => state.importing);
  return <SafeAreaView edges={['top']} style={ui.safe}><ScrollView contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled"><View style={ui.row}><Image source={require("../../assets/images/tempo-icon.png")} style={{ width: 40, height: 40, borderRadius: 12 }} /><Text style={{ color: colors.text, fontWeight: "800", fontSize: 23 }}>Tempo<Text style={{ color: colors.primary }}>.</Text></Text></View><Text style={ui.heading}>{title}</Text>{title === "Your Library" ? <Text style={ui.muted}>Import asks Android to grant access to the files you select. Downloads stay in Tempo’s private storage.</Text> : null}{error ? <><Text style={ui.error}>{error}</Text><Action title="Recover library" onPress={() => Alert.alert('Recover library?', 'Scan saved audio files and rebuild metadata. A copy of the existing metadata will be preserved. Some titles and favorites may not be recoverable.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Recover', onPress: () => void recoverLibrary().then(() => useLibrary.getState().refresh()).catch(reportError) }])} /></> : null}{importing ? <Text style={ui.muted}>Importing audio…</Text> : null}{children}</ScrollView><MiniPlayer /></SafeAreaView>;
}
export function EmptyLibrary() {
  return <View style={ui.card}><Text style={ui.section}>Your music starts here</Text><Text style={ui.muted}>No music downloaded yet. Search for music or import your own MP3 files.</Text><View style={ui.row}><Action title="Import MP3" onPress={runImport} /><Action title="Downloads" onPress={() => router.push('/downloads')} /></View></View>;
}
export const ui = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { padding: 20, gap: 14, paddingBottom: 30 },
  heading: { color: colors.text, fontSize: 28, fontWeight: '800', marginBottom: 8 },
  section: { color: colors.text, fontSize: 19, fontWeight: '800', marginTop: 12 },
  muted: { color: colors.textSecondary, fontSize: 13, lineHeight: 20 }, error: { color: '#FB7185' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  card: { backgroundColor: colors.surface, padding: 16, borderRadius: 14, gap: 12 },
  button: { backgroundColor: colors.surfaceLight, paddingHorizontal: 14, paddingVertical: 14, minHeight: 48, borderRadius: 14 },
  buttonText: { color: colors.text, fontWeight: '700', fontSize: 13 },
  input: { borderRadius: 12, backgroundColor: colors.surface, color: colors.text, padding: 14, fontSize: 15 },
});
