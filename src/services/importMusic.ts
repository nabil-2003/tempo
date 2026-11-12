import { File } from 'expo-file-system';
import { createAudioPlayer } from 'expo-audio';
import { assertStorageSpace, findLocalSongBySource, getAudioFile, getThumbnailFile, initializeMusicStorage, saveLocalSong } from './musicStorage';
import { parseId3 } from './id3';
import type { LocalSong } from '@/src/types/music';

export async function probeDuration(uri: string): Promise<number> {
  const player = createAudioPlayer({ uri });
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (player.isLoaded) return player.duration;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('Audio could not be loaded. Choose a valid supported audio file.');
  } finally { player.remove(); }
}
export async function importMusic() {
  const result = await File.pickFileAsync({ mimeTypes: ['audio/mpeg', 'audio/mp3'], multipleFiles: true });
  if (result.canceled) return;
  await initializeMusicStorage();
  for (const source of result.result) {
    const asset = { name: source.name, uri: source.uri };
    const sourceUrl = `import:${await source.digest('MD5')}`;
    if (await findLocalSongBySource(sourceUrl)) continue;
    assertStorageSpace(source.size);
    const id = `song_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const temporary = getAudioFile(`musics/${id}.part`);
    const final = getAudioFile(`musics/${id}.mp3`);
    try {
      const handle = source.open();
      try {
        const header = await handle.readBytes(3);
        if (!(header[0] === 0x49 && header[1] === 0x44 && header[2] === 0x33) && !(header[0] === 0xff && (header[1] & 0xe0) === 0xe0)) throw new Error('Choose a valid MP3 file.');
      } finally { handle.close(); }
      const tagHandle = source.open();
      let tags;
      try { tags = parseId3(await tagHandle.readBytes(Math.min(source.size, 512 * 1024))); } finally { tagHandle.close(); }
      const duration = await probeDuration(asset.uri);
      await source.copy(temporary);
      await temporary.move(final);
      let thumbnailFile: string | undefined;
      if (tags.artwork) {
        thumbnailFile = `thumbnails/${id}.jpg`;
        await getThumbnailFile(thumbnailFile).write(tags.artwork);
      }
      const song: LocalSong = { id, title: tags.title || asset.name.replace(/\.mp3$/i, ''), artist: tags.artist || 'Unknown artist', album: tags.album, thumbnailFile, duration, source: 'local', sourceUrl,
        audioFile: `musics/${id}.mp3`, format: 'mp3', favorite: false, downloadedAt: new Date().toISOString(), fileSize: final.size, downloadStatus: 'completed' };
      await saveLocalSong(song);
    } catch (error) {
      if (temporary.exists) temporary.delete();
      if (final.exists) final.delete();
      const artwork = getThumbnailFile(`thumbnails/${id}.jpg`);
      if (artwork.exists) artwork.delete();
      throw error;
    }
  }
}
