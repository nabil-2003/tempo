import { supportsBackgroundControls } from "@/src/services/playbackCapabilities";
import { useDownloadQueue } from "@/src/store/downloads";
import { setAudioModeAsync, useAudioPlaylist } from 'expo-audio';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { registerAudioPlayer } from '@/src/services/audioEngine';
import { connectPlayback } from '@/src/services/playbackBridge';
import { bindPlaybackCommands, usePlayer } from '@/src/store/player';
import { useLibrary } from '@/src/store/library';
import { getAudioFile, readState, writeState, subscribeLibrary, recordPlay, updateSongDuration, getThumbnailFile } from '@/src/services/musicStorage';
import type { PlaybackSnapshot } from '@/src/types/library';

export function AudioEngine() {
  const player = useAudioPlaylist({ updateInterval: 500 });
  const hydrated = useRef(false);
  useEffect(() => {
    registerAudioPlayer(player);
    const disconnect = connectPlayback(player, usePlayer, {
      audioUri: song => { const file = getAudioFile(song.audioFile); return file.exists ? file.uri : undefined; },
      artworkUri: song => song.thumbnailFile && getThumbnailFile(song.thumbnailFile).exists ? getThumbnailFile(song.thumbnailFile).uri : undefined,
      recordPlay, updateDuration: updateSongDuration, lockScreenControls: supportsBackgroundControls,
    });
    bindPlaybackCommands({ next: () => player.next(), previous: () => player.previous() });
    void setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: supportsBackgroundControls, interruptionMode: 'doNotMix' }).catch(error => usePlayer.setState({ error: String(error) }));
    let active = true;
    const refresh = async () => {
      await useLibrary.getState().refresh();
      if (active && !useLibrary.getState().error) usePlayer.getState().setLibrary(useLibrary.getState().songs);
    };
    void refresh().then(async () => {
      await useDownloadQueue.getState().hydrate();
      const snapshot = await readState<PlaybackSnapshot | null>('playback.json', null);
      if (active && snapshot) usePlayer.getState().restore(snapshot);
      hydrated.current = true;
    }).catch(error => { usePlayer.setState({ error: String(error) }); hydrated.current = true; });
    const unsubscribe = subscribeLibrary(() => { void refresh(); });
    const persist = () => {
      if (!hydrated.current) return;
      const state = usePlayer.getState();
      void writeState('playback.json', { queue: state.queue, originalQueue: state.originalQueue, currentId: state.currentTrack?.id, position: state.position, repeat: state.repeat, shuffle: state.shuffle, volume: state.volume }).catch(error => usePlayer.setState({ error: String(error) }));
    };
    const timer = setInterval(persist, 5000);
    const subscription = AppState.addEventListener('change', state => { persist(); if (state === 'active') void refresh(); });
    return () => { active = false; clearInterval(timer); subscription.remove(); unsubscribe(); persist(); disconnect(); bindPlaybackCommands(); registerAudioPlayer(null); };
  }, [player]);
  return null;
}
