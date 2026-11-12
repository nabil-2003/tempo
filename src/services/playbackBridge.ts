import type { AudioPlaylist, AudioPlaylistStatus } from 'expo-audio';
import type { StoreApi } from 'zustand';
import type { PlayerState } from '@/src/store/player';
import type { LocalSong } from '@/src/types/music';

type Access = {
  lockScreenControls?: boolean;
  audioUri: (song: LocalSong) => string | undefined;
  artworkUri: (song: LocalSong) => string | undefined;
  recordPlay: (id: string) => Promise<unknown>;
  updateDuration: (id: string, duration: number) => Promise<unknown>;
};

/** One native queue owns playback, including system controls while JS is backgrounded. */
export function connectPlayback(player: AudioPlaylist, store: StoreApi<PlayerState>, access: Access) {
  let applying = false;
  let syncing = false;
  let ids: string[] = [];
  let queueKey = '';
  let metadataKey = '';
  let controlsActive = false;
  let revision = -1;
  let durationKey = '';
  let lastPlayingId: string | undefined;
  let appliedLoop: string | undefined;
  let appliedVolume: number | undefined;

  function fail(error: unknown) {
    syncing = true;
    try { store.setState({ isPlaying: false, buffering: false, error: error instanceof Error ? error.message : String(error) }); }
    finally { syncing = false; }
  }
  function metadata(song: LocalSong) {
    if (access.lockScreenControls === false) return;
    const artworkUrl = access.artworkUri(song);
    const key = JSON.stringify([song.id, song.title, song.artist, song.album, artworkUrl]);
    if (key === metadataKey) return;
    const info = { title: song.title, artist: song.artist, albumTitle: song.album, artworkUrl };
    if (controlsActive) player.updateLockScreenMetadata(info);
    else {
      player.setActiveForLockScreen(true, info, { showNextTrack: true, showPreviousTrack: true, showSeekForward: true, showSeekBackward: true });
      controlsActive = true;
    }
    metadataKey = key;
  }
  function apply(state: PlayerState, previous?: PlayerState) {
    if (syncing) return;
    applying = true;
    try {
      if (!state.currentTrack) {
        if (ids.length) { player.pause(); player.clear(); }
        if (controlsActive) player.clearLockScreenControls();
        ids = []; queueKey = ''; metadataKey = ''; controlsActive = false;
        return;
      }
      const wanted = [...new Set(state.queue.length ? state.queue : [state.currentTrack.id])];
      if (!wanted.includes(state.currentTrack.id)) wanted.push(state.currentTrack.id);
      const tracks = wanted.map(id => state.library.find(song => song.id === id) ?? (state.currentTrack?.id === id ? state.currentTrack : undefined))
        .filter((song): song is LocalSong => !!song)
        .map(song => ({ song, uri: access.audioUri(song) })).filter(item => !!item.uri);
      const index = tracks.findIndex(item => item.song.id === state.currentTrack?.id);
      if (index < 0) {
        player.pause(); if (controlsActive) player.clearLockScreenControls(); controlsActive = false; metadataKey = '';
        fail(new Error('Audio file is missing. Import or download this song again.'));
        return;
      }
      const key = JSON.stringify(tracks.map(item => [item.song.id, item.uri]));
      const rebuilt = key !== queueKey;
      if (rebuilt) {
        player.pause(); player.clear();
        ids = tracks.map(item => item.song.id);
        for (const { song, uri } of tracks) player.add({ uri, name: song.title });
        queueKey = key;
      }
      const loop = state.repeat === 'one' ? 'single' : state.repeat === 'all' ? 'all' : 'none';
      if (loop !== appliedLoop) { player.loop = loop; appliedLoop = loop; }
      if (state.volume !== appliedVolume) { player.volume = state.volume; appliedVolume = state.volume; }
      const selected = rebuilt || revision !== state.revision || player.currentIndex !== index;
      if (selected) {
        revision = state.revision;
        player.skipTo(index);
        // skipTo already selects position zero. Avoid a second seek/decoder flush
        // for new tracks; seeking is needed only for a nonzero restored position.
        if (state.position > 0) void player.seekTo(state.position).catch(fail);
      }
      metadata(state.currentTrack);
      if (selected || state.isPlaying !== previous?.isPlaying) {
        if (state.isPlaying) {
          if (!selected && player.duration > 0 && player.currentTime >= player.duration - 0.05) void player.seekTo(0).catch(fail);
          player.play();
        } else player.pause();
      }
    } catch (error) { fail(error); }
    finally { applying = false; }
  }
  function nativeStatus(event?: AudioPlaylistStatus & { error?: { message?: string } }) {
    if (applying) return;
    if (event?.error) { player.pause(); fail(new Error(event.error.message ?? 'This audio file could not be played.')); return; }
    // Read the latest snapshot; queued events from clear/add/skip must not restore an old track.
    const status = player.currentStatus;
    if (status.trackCount !== ids.length || !ids.length) return;
    const state = store.getState();
    const track = state.library.find(song => song.id === ids[status.currentIndex]);
    if (!track) return;
    const playing = status.playing || (status.isBuffering && state.isPlaying);
    syncing = true;
    try {
      store.setState({ currentTrack: track, isPlaying: playing, buffering: status.isBuffering,
        position: status.currentTime, duration: status.duration,
        progress: status.duration > 0 ? Math.max(0, Math.min(1, status.currentTime / status.duration)) : 0,
      });
    } finally { syncing = false; }
    metadata(track);
    if (status.playing && lastPlayingId !== track.id) {
      lastPlayingId = track.id;
      void access.recordPlay(track.id).catch(fail);
    } else if (!playing && !status.isBuffering) lastPlayingId = undefined;
    const measured = `${track.id}:${Math.round(status.duration)}`;
    if (status.isLoaded && status.duration > 0 && measured !== durationKey) {
      durationKey = measured;
      void access.updateDuration(track.id, status.duration).catch(fail);
    }
  }
  const statusListener = player.addListener('playlistStatusUpdate', nativeStatus);
  const trackListener = player.addListener('trackChanged', () => nativeStatus());
  const unsubscribe = store.subscribe(apply);
  apply(store.getState());
  return () => {
    unsubscribe(); statusListener.remove(); trackListener.remove();
    try { player.pause(); if (controlsActive) player.clearLockScreenControls(); }
    catch { /* The releasing hook may already have destroyed the native object. */ }
  };
}
