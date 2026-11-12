import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';

// Expo Go does not contain this project's foreground media service. Calling the
// lock-screen API there logs native errors; it cannot be enabled by a JS reload.
const inExpoGo = isRunningInExpoGo();
export const supportsBackgroundControls = !inExpoGo && Platform.OS !== 'web';
export const playbackNotice = inExpoGo
  ? 'Expo Go preview: background playback and lock-screen controls need the Tempo build.'
  : undefined;
