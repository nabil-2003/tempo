import { Directory, File, Paths } from "expo-file-system";

import type { LocalSong } from "@/src/types/music";

const root = new Directory(Paths.document, "Tempo");
const musics = new Directory(root, "musics");
const thumbnails = new Directory(root, "thumbnails");
const data = new Directory(root, "data");
const database = new File(data, "songs.json");

function ensureDirectory(directory: Directory) {
  if (!directory.exists) {
    directory.create({ intermediates: true });
  }
}

export async function initializeMusicStorage() {
  ensureDirectory(root);
  ensureDirectory(musics);
  ensureDirectory(thumbnails);
  ensureDirectory(data);
}

async function readSongs(): Promise<LocalSong[]> {
  await initializeMusicStorage();
  if (!database.exists) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(await database.text());
    if (!Array.isArray(parsed)) {
      throw new Error("Invalid library metadata.");
    }
    if (!parsed.every(isLocalSong)) throw new Error("Invalid library entry.");
    return parsed;
  } catch {
    const backup = new File(data, "songs.json.bak");
    if (backup.exists) {
      try {
        const restored: unknown = JSON.parse(await backup.text());
        if (Array.isArray(restored) && restored.every(isLocalSong)) return restored;
      } catch { /* Keep the original and report recovery is needed. */ }
    }
    throw new Error("Your music library could not be read. Existing metadata was preserved. Use Recover library to scan your audio files.");
  }
}

function isLocalSong(value: unknown): value is LocalSong {
  if (!value || typeof value !== "object") {
    return false;
  }
  const song = value as Partial<LocalSong>;
  return (
    typeof song.id === "string" &&
    typeof song.title === "string" &&
    typeof song.artist === "string" &&
    typeof song.audioFile === "string" && /^musics\/[a-zA-Z0-9_.-]+$/.test(song.audioFile) &&
    song.downloadStatus === "completed"
  );
}

async function writeSongs(songs: LocalSong[]) {
  await initializeMusicStorage();
  const temporary = new File(data, "songs.json.tmp");
  if (database.exists) {
    const previous = await database.text();
    let valid = false;
    try {
      const parsed: unknown = JSON.parse(previous);
      valid = Array.isArray(parsed) && parsed.every(isLocalSong);
    } catch { /* Preserve corrupt data separately before writing from a backup. */ }
    if (valid) await new File(data, "songs.json.bak").write(previous);
    else await database.copy(new File(data, `songs.corrupt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`));
  }
  await temporary.write(JSON.stringify(songs, null, 2));
  await temporary.move(database, { overwrite: true });
}

async function readLocalSongs(): Promise<LocalSong[]> {
  const songs = await readSongs();
  const validSongs: LocalSong[] = [];

  for (const song of songs) {
    if (new File(root, song.audioFile).exists) {
      validSongs.push(song);
    }
  }

  return validSongs;
}

export async function findLocalSongBySource(sourceUrl: string) {
  const songs = await listLocalSongs();
  return songs.find((song) => song.sourceUrl === sourceUrl);
}

export function getAudioFile(relativePath: string) {
  return new File(root, relativePath);
}

export function getThumbnailFile(relativePath: string) {
  return new File(root, relativePath);
}

export function getMusicDirectory() {
  return musics;
}

export function getThumbnailDirectory() {
  return thumbnails;
}

async function saveSong(song: LocalSong) {
  const songs = await readSongs();
  const next = songs.filter((item) => item.id !== song.id && item.sourceUrl !== song.sourceUrl);
  await writeSongs([...next, song]);
}

async function removeSong(id: string) {
  const songs = await readSongs();
  const song = songs.find((item) => item.id === id);
  if (!song) {
    return;
  }

  const audio = getAudioFile(song.audioFile);
  if (audio.exists) {
    audio.delete();
  }
  if (song.thumbnailFile) {
    const thumbnail = getThumbnailFile(song.thumbnailFile);
    if (thumbnail.exists) {
      thumbnail.delete();
    }
  }
  await writeSongs(songs.filter((item) => item.id !== id));
}

let transaction: Promise<unknown> = Promise.resolve();
function serialized<T>(action: () => Promise<T>): Promise<T> {
  const next = transaction.then(action);
  transaction = next.catch(() => undefined);
  return next;
}
export function listLocalSongs() { return serialized(readLocalSongs); }
export function toggleLocalFavorite(id: string) {
  return serialized(async () => {
    const songs = await readSongs();
    await writeSongs(songs.map(song => song.id === id ? { ...song, favorite: !song.favorite } : song));
  }).then(emitChange);
}

export function saveLocalSong(song: LocalSong) { return serialized(() => saveSong(song)).then(emitChange); }
export function removeLocalSong(id: string) { return serialized(() => removeSong(id)).then(emitChange); }

const listeners = new Set<() => void>();
function emitChange() { listeners.forEach(listener => listener()); }
export function subscribeLibrary(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function getDataFile(name: string) { return new File(data, name); }
export function getStorageUsage() { return musics.list().filter((file): file is File => file instanceof File).reduce((total, file) => total + file.size, 0) + thumbnails.list().filter((file): file is File => file instanceof File).reduce((total, file) => total + file.size, 0); }
export function assertStorageSpace(bytes: number) {
  if (Paths.availableDiskSpace < bytes + 1024 * 1024) throw new Error("Not enough storage space. Free up space and try again.");
}
export function recordPlay(id: string) {
  return serialized(async () => {
    const songs = await readSongs();
    await writeSongs(songs.map(song => song.id === id ? { ...song, lastPlayedAt: new Date().toISOString(), playCount: (song.playCount ?? 0) + 1 } : song));
  }).then(emitChange);
}
export function updateSongDuration(id: string, duration: number) {
  return serialized(async () => {
    const songs = await readSongs();
    if (songs.some(song => song.id === id && Math.abs((song.duration ?? 0) - duration) > 1)) {
      await writeSongs(songs.map(song => song.id === id ? { ...song, duration } : song));
    }
  }).then(emitChange);
}
export function recoverLibrary() {
  return serialized(async () => {
    await initializeMusicStorage();
    if (database.exists) await database.copy(new File(data, `songs.corrupt-${Date.now()}.json`));
    const songs: LocalSong[] = [];
    for (const file of musics.list()) {
      if (!(file instanceof File) || !/\.(mp3|m4a|webm|opus|ogg|flac|wav|aac)$/i.test(file.name)) continue;
      const extension = file.extension.slice(1).toLowerCase() as LocalSong['format'];
      const id = file.name.slice(0, -(extension.length + 1));
      songs.push({ id, title: id, artist: "Unknown artist", source: "local", sourceUrl: file.uri, audioFile: `musics/${file.name}`, format: extension, favorite: false, downloadedAt: new Date().toISOString(), downloadStatus: "completed", fileSize: file.size });
    }
    await writeSongs(songs);
  }).then(emitChange);
}
let stateTransaction: Promise<unknown> = Promise.resolve();
export async function readState<T>(name: string, fallback: T): Promise<T> {
  await initializeMusicStorage();
  const file = getDataFile(name);
  if (!file.exists) return fallback;
  try { return JSON.parse(await file.text()) as T; }
  catch { throw new Error(`${name} is corrupted. Existing data was preserved.`); }
}
export function writeState(name: string, value: unknown) {
  const run = stateTransaction.then(async () => {
    await initializeMusicStorage();
    const file = getDataFile(name);
    const temporary = getDataFile(`${name}.tmp`);
    if (file.exists) {
      const text = await file.text();
      try { JSON.parse(text); } catch { throw new Error(`${name} is corrupted; changes were not saved.`); }
      await getDataFile(`${name}.bak`).write(text);
    }
    await temporary.write(JSON.stringify(value));
    await temporary.move(file, { overwrite: true });
  });
  stateTransaction = run.catch(() => undefined);
  return run;
}
