import { create } from 'zustand';
import type { LocalSong } from '@/src/types/music';
import type { PlaybackSnapshot } from '@/src/types/library';

export type PlayableTrack = LocalSong;
export type PlayerState = {
  revision: number; currentTrack: LocalSong | null; library: LocalSong[]; queue: string[];
  isPlaying: boolean; buffering: boolean; progress: number; position: number; duration: number; originalQueue: string[];
  repeat: 'off' | 'one' | 'all'; shuffle: boolean; volume: number; error?: string;
  setLibrary: (songs: LocalSong[]) => void;
  restore: (snapshot: PlaybackSnapshot) => void;
  play: (track?: LocalSong, queue?: LocalSong[]) => void;
  pause: () => void; toggle: () => void; next: () => void; previous: () => void;
  setShuffle: (enabled: boolean) => void;
  finish: () => void; setProgress: (progress: number) => void;
  syncPlayback: (playing: boolean, progress: number) => void;
};
let nativeCommands: { next: () => void; previous: () => void } | undefined;
export function bindPlaybackCommands(commands?: typeof nativeCommands) { nativeCommands = commands; }
function shuffled(ids: string[], currentId?: string) {
  const remaining = ids.filter(id => id !== currentId);
  for (let i = remaining.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
  }
  return currentId && ids.includes(currentId) ? [currentId, ...remaining] : remaining;
}
export const usePlayer = create<PlayerState>((set, get) => ({
  revision: 0, currentTrack: null, library: [], queue: [], isPlaying: false, progress: 0, position: 0, duration: 0,
  repeat: 'off', shuffle: false, volume: 1, buffering: false, originalQueue: [],
  setLibrary: library => set(state => {
    const currentTrack = library.find(song => song.id === state.currentTrack?.id) ?? null;
    return { library, currentTrack, queue: state.queue.filter(id => library.some(song => song.id === id)), ...(!currentTrack ? { isPlaying: false, progress: 0, position: 0 } : {}) };
  }),
  restore: snapshot => {
    if (!snapshot || !Array.isArray(snapshot.queue)) return;
    const library = get().library;
    const currentTrack = library.find(song => song.id === snapshot.currentId) ?? null;
    set({ revision: get().revision + 1, queue: snapshot.queue.filter(id => library.some(song => song.id === id)), currentTrack,
      originalQueue: (Array.isArray(snapshot.originalQueue) ? snapshot.originalQueue : snapshot.queue).filter(id => library.some(song => song.id === id)),
      position: Number.isFinite(snapshot.position) ? Math.max(0, snapshot.position) : 0,
      repeat: ['off', 'one', 'all'].includes(snapshot.repeat) ? snapshot.repeat : 'off', shuffle: snapshot.shuffle === true,
      volume: Number.isFinite(snapshot.volume) ? Math.max(0, Math.min(1, snapshot.volume)) : 1, isPlaying: false });
  },
  play: (track, songs) => {
    if (!track && !get().currentTrack) return;
    const queue = (songs ?? get().library).map(song => song.id);
    set({ currentTrack: track ?? get().currentTrack, isPlaying: true, error: undefined,
      ...(track ? { revision: get().revision + 1, position: 0, progress: 0, duration: track.duration ?? 0, originalQueue: queue, queue: get().shuffle ? shuffled(queue, track.id) : queue } : {}) });
  },
  pause: () => set({ isPlaying: false }),
  toggle: () => { if (get().currentTrack) set(state => ({ isPlaying: !state.isPlaying, error: undefined })); },
  next: () => {
    if (nativeCommands) { nativeCommands.next(); return; }
    const state = get();
    const queue = state.queue.length ? state.queue : state.library.map(song => song.id);
    if (!queue.length) return;
    const index = queue.indexOf(state.currentTrack?.id ?? '');
    const nextIndex = state.shuffle && queue.length > 1 ? (index + 1 + Math.floor(Math.random() * (queue.length - 1))) % queue.length : (index + 1) % queue.length;
    const track = state.library.find(song => song.id === queue[nextIndex]);
    if (track) set({ revision: state.revision + 1, currentTrack: track, position: 0, progress: 0, isPlaying: true, error: undefined });
  },
  previous: () => {
    if (nativeCommands) { nativeCommands.previous(); return; }
    const state = get(); const queue = state.queue.length ? state.queue : state.library.map(song => song.id);
    if (!queue.length) return;
    const index = queue.indexOf(state.currentTrack?.id ?? '');
    const track = state.library.find(song => song.id === queue[(index - 1 + queue.length) % queue.length]);
    if (track) set({ revision: state.revision + 1, currentTrack: track, position: 0, progress: 0, isPlaying: true, error: undefined });
  },
  setShuffle: enabled => set(state => ({ shuffle: enabled,
    originalQueue: enabled ? [...state.queue] : state.originalQueue,
    queue: enabled ? shuffled(state.queue, state.currentTrack?.id) : state.originalQueue.filter(id => state.library.some(song => song.id === id)),
  })),
  finish: () => {
    const state = get();
    const queue = state.queue;
    if (state.repeat === 'one') { set({ position: 0, progress: 0 }); return; }
    if (state.repeat === 'off' && !state.shuffle && queue.indexOf(state.currentTrack?.id ?? '') === queue.length - 1) { set({ isPlaying: false, position: 0, progress: 0 }); return; }
    state.next();
  },
  setProgress: progress => set({ progress: Math.max(0, Math.min(1, progress)) }),
  syncPlayback: (isPlaying, progress) => set({ isPlaying, progress }),
}));
