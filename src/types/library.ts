export type Playlist = { id: string; name: string; songIds: string[]; createdAt: string; sourceUrl?: string; sourceOrder?: string[]; downloadBatchId?: string };
export type PlaybackSnapshot = { queue: string[]; originalQueue?: string[]; currentId?: string; position: number; repeat: 'off' | 'one' | 'all'; shuffle: boolean; volume: number };
