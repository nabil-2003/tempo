import type { AudioPlayer } from 'expo-audio';

type Transport = Pick<AudioPlayer, 'duration' | 'seekTo'>;
let player: Transport | null = null;

export function registerAudioPlayer(nextPlayer: Transport | null) {
  player = nextPlayer;
}

export function seekAudio(progress: number, _duration?: number) {
  if (player && player.duration > 0) {
    void player.seekTo(Math.max(0, Math.min(1, progress)) * player.duration);
  }
}
