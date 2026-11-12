import { DownloadProgress, PlaylistProgress } from "@/src/components/DownloadQueue";
import { useDownloadQueue } from "@/src/store/downloads";
import { MiniPlayer } from "@/src/components/MiniPlayer";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useDownloads } from "@/src/hooks/useDownloads";
import { usePlayer } from "@/src/store/player";
import { getThumbnailFile } from "@/src/services/musicStorage";
import { router, useLocalSearchParams } from "expo-router";
import { backendProvider } from "@/src/services/providers/backendProvider";
import type { MusicSearchResult } from "@/src/services/providers/musicProvider";
import { colors } from "@/src/theme/colors";

const audioQualities = [
  { label: "Original", bitrate: "original" },
  { label: "Low", bitrate: 128 },
  { label: "Medium", bitrate: 192 },
  { label: "High", bitrate: 320 },
] as const;

function estimatedSize(duration: number, bitrate: number) {
  return duration > 0 ? `~${((duration * bitrate) / 8000).toFixed(1)} MB` : undefined;
}

function formatDuration(seconds: number) {
  if (!seconds) {
    return "Unknown length";
  }
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export default function DownloadsScreen() {
  const params = useLocalSearchParams<{ query?: string }>();
  const [input, setInput] = useState({ route: params.query, value: params.query ?? "" });
  const query = input.route === params.query ? input.value : params.query ?? "";
  const setQuery = (value: string) => setInput({ route: params.query, value });
  const [results, setResults] = useState<MusicSearchResult[]>([]);
  const [error, setError] = useState<string>();
  const [searching, setSearching] = useState(false);
  const searchRequest = useRef<AbortController | null>(null);
  useEffect(() => () => searchRequest.current?.abort(), []);
  const { items, downloaded, enqueue, remove, favorite } = useDownloads();

  const { batches, error: queueError } = useDownloadQueue();
  const batchSources = new Set(batches.flatMap(batch => batch.entries.flatMap(entry => entry.song ? [entry.song.sourceUrl] : [])));
  const standaloneItems = items.filter(item => !batchSources.has(item.song.sourceUrl));
  async function search() {
    if (searching) return;
    const value = query.trim();
    if (!value) {
      setResults([]);
      return;
    }

    const controller = new AbortController();
    searchRequest.current = controller;
    setSearching(true);
    setError(undefined);
    try {
      const found = await backendProvider.search(value, controller.signal);
      setResults(found);
      if (!found.length) setError("No music found. Try another song or artist name.");
    } catch (reason) {
      setResults([]);
      setError(controller.signal.aborted ? "Search cancelled." : reason instanceof Error ? reason.message : "Search failed.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}><Image source={require("../../assets/images/tempo-icon.png")} style={{ width: 44, height: 44, borderRadius: 13 }} /><View><Text style={styles.heading}>Downloads</Text><Text style={styles.songSubtitle}>Your music, everywhere.</Text></View></View><Pressable accessibilityRole="button" onPress={() => router.push("/playlist")} style={[styles.qualityChoice, { marginTop: 20, flexDirection: "row", alignItems: "center", gap: 12 }]}><Ionicons name="list-circle-outline" color={colors.primary} size={28} /><Text style={styles.songTitle}>Download a playlist</Text><Ionicons name="chevron-forward" color={colors.textSecondary} size={20} /></Pressable>
        <Text style={styles.description}>
          Search by song or artist name, then choose your audio quality when downloading. Search results do not grant download permission. Save only audio you own or are authorized to download.
        </Text>

        <View style={styles.searchBox}>
          <Ionicons name="search" size={20} color={colors.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => void search()}
            placeholder="Search songs or artists"
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
            returnKeyType="search"
          />
          <Pressable accessibilityLabel={searching ? "Cancel search" : "Search music"} onPress={() => searching ? searchRequest.current?.abort() : void search()} hitSlop={10}>
            {searching ? (
              <View style={{ flexDirection: "row", gap: 6 }}><ActivityIndicator color={colors.primary} /><Ionicons name="close" size={20} color={colors.textSecondary} /></View>
            ) : (
              <Ionicons name="arrow-forward-circle" size={24} color={colors.primary} />
            )}
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {queueError ? <Text style={styles.error}>{queueError}</Text> : null}
        {batches.map(batch => <View key={batch.id} style={{ marginTop: 16 }}><PlaylistProgress batchId={batch.id} /></View>)}
        {standaloneItems.length > 0 ? <><Text style={styles.sectionTitle}>Download queue</Text>{standaloneItems.map(item => <View key={item.song.sourceUrl} style={{ marginBottom: 10 }}><DownloadProgress item={item} /></View>)}</> : null}

        {results.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Search results</Text>
            {results.map((song) => (
              <SongResult
                key={`${song.provider}-${song.id}`}
                song={song}
                onDownload={(quality) => void enqueue({ ...song, format: quality === "original" ? "original" : "mp3", quality: quality === "original" ? undefined : quality })}
              />
            ))}
          </>
        ) : null}

        <Text style={styles.sectionTitle}>Downloaded music</Text>
        {downloaded.length === 0 ? (
          <Text style={styles.empty}>
            Your offline music will appear here after an authorized download.
          </Text>
        ) : (
          downloaded.map((song) => (
            <View key={song.id} style={styles.downloaded}>
              {song.thumbnailFile ? <Image source={{ uri: getThumbnailFile(song.thumbnailFile).uri }} style={styles.thumbnail} /> : <Ionicons name="musical-note" size={20} color={colors.primary} />}
              <Pressable accessibilityLabel={`Play ${song.title}`} onPress={() => usePlayer.getState().play(song)} style={styles.queueCopy}>
                <Text style={styles.songTitle} numberOfLines={1}>{song.title}</Text>
                <Text style={styles.songSubtitle}>{song.artist} · Tap to play</Text>
              </Pressable>
              <Pressable accessibilityLabel="Toggle favorite" onPress={() => void favorite(song.id)} hitSlop={10}>
                <Ionicons name={song.favorite ? "heart" : "heart-outline"} size={22} color={colors.primary} />
              </Pressable>
              <Pressable accessibilityLabel={`Delete ${song.title}`} onPress={() => Alert.alert("Delete song?", "This removes the saved audio and artwork from Tempo.", [
                { text: "Cancel", style: "cancel" },
                { text: "Delete", style: "destructive", onPress: () => void remove(song.id) },
              ])} hitSlop={10}>
                <Ionicons name="trash-outline" size={20} color="#FB7185" />
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
      <MiniPlayer />
    </SafeAreaView>
  );
}

function SongResult({
  song,
  onDownload,
}: {
  song: MusicSearchResult;
  onDownload: (quality: "original" | 128 | 192 | 320) => void;
}) {
  const [choosing, setChoosing] = useState(false);
  function confirmDownload(quality: "original" | 128 | 192 | 320) {
    setChoosing(false);
    Alert.alert("Confirm authorized download", "Only save this audio if you own it, have a license, or otherwise have permission.", [
      { text: "Cancel", style: "cancel" },
      { text: "Download", onPress: () => onDownload(quality) },
    ]);
  }

  return (
    <View style={styles.result}>
      <Modal visible={choosing} transparent animationType="slide" onRequestClose={() => setChoosing(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.qualitySheet}>
            <Text style={styles.sectionTitle}>Choose audio quality</Text>
            <Text style={styles.songTitle} numberOfLines={2}>{song.title}</Text>
            {audioQualities.map(option => <Pressable key={option.label} accessibilityRole="button" onPress={() => confirmDownload(option.bitrate)} style={styles.qualityChoice}>
              <Text style={styles.qualityLabel}>{option.label}</Text>
              <Text style={styles.songSubtitle}>{option.bitrate === "original" ? "Keep source audio · no conversion" : `MP3 · ${option.bitrate} kbps${song.duration ? ` · ${estimatedSize(song.duration, option.bitrate)}` : ""}`}</Text>
            </Pressable>)}
            <Text style={styles.songSubtitle}>Original preserves the available source audio. Higher MP3 bitrate cannot restore missing quality.</Text>
            <Pressable accessibilityRole="button" onPress={() => setChoosing(false)} style={styles.qualityChoice}><Text style={styles.qualityLabel}>Cancel</Text></Pressable>
          </View>
        </View>
      </Modal>
      {song.thumbnailUrl ? (
        <Image source={{ uri: song.thumbnailUrl }} style={styles.thumbnail} />
      ) : (
        <View style={[styles.thumbnail, styles.thumbnailFallback]}>
          <Ionicons name="musical-notes" size={24} color={colors.textSecondary} />
        </View>
      )}
      <View style={styles.queueCopy}>
        <Text style={styles.songTitle} numberOfLines={1}>{song.title}</Text>
        <Text style={styles.songSubtitle} numberOfLines={1}>
          {song.artist} · {formatDuration(song.duration)}
        </Text>

      </View>
      {song.downloadable === true ? (
        <Pressable accessibilityLabel={`Download ${song.title}`} onPress={() => setChoosing(true)} hitSlop={10}>
          <Ionicons name="download-outline" size={24} color={colors.primary} />
        </Pressable>
      ) : (
        <Ionicons name="lock-closed-outline" size={22} color={colors.textSecondary} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 30 },
  heading: { color: colors.text, fontSize: 28, fontWeight: "800" },
  description: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 6, marginBottom: 18 },
  searchBox: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 14,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  input: { color: colors.text, flex: 1, fontSize: 14 },
  error: { color: "#FB7185", fontSize: 13, marginTop: 12 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: "800", marginBottom: 10, marginTop: 26 },
  result: { alignItems: "center", flexDirection: "row", gap: 12, paddingVertical: 8 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  qualitySheet: { backgroundColor: colors.surface, padding: 24, paddingBottom: 40, borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 12 },
  qualityChoice: { minHeight: 52, backgroundColor: colors.surfaceLight, borderRadius: 12, padding: 14, gap: 4 },
  qualityOptions: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  qualityOption: { minHeight: 44, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: colors.border, gap: 3 },
  selectedQuality: { borderColor: colors.primary, backgroundColor: colors.surfaceLight },
  qualityLabel: { color: colors.text, fontSize: 15, fontWeight: "700" },
  selectedQualityLabel: { color: colors.primary },
  thumbnail: { backgroundColor: colors.surfaceLight, borderRadius: 8, height: 56, width: 56 },
  thumbnailFallback: { alignItems: "center", justifyContent: "center" },
  queueCopy: { flex: 1, gap: 4 },
  songTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
  songSubtitle: { color: colors.textSecondary, fontSize: 12 },
  queueItem: { backgroundColor: colors.surface, borderRadius: 12, flexDirection: "row", flexWrap: "wrap", gap: 10, padding: 12 },
  downloaded: { alignItems: "center", backgroundColor: colors.surface, borderRadius: 12, flexDirection: "row", gap: 12, marginBottom: 8, padding: 13 },
  status: { color: colors.textSecondary, fontSize: 11 },
  progressTrack: { backgroundColor: colors.border, borderRadius: 2, height: 3, marginTop: 2, width: "100%" },
  progress: { backgroundColor: colors.primary, borderRadius: 2, height: 3 },
  empty: { color: colors.textSecondary, fontSize: 13, lineHeight: 20 },
});
