const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');

function load(file, dependencies, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: name => { if (!(name in dependencies)) throw Error(name); return dependencies[name]; }, process, Error, AbortController, Date, Math, Map, setTimeout, clearTimeout, TextDecoder, ...globals });
  return exports;
}
function filesystem() {
  const files = new Map();
  const directories = new Set();
  const uri = parts => parts.map(p => typeof p === 'string' ? p : p.uri).join('/');
  class Directory {
    constructor(...parts) { this.uri = uri(parts); }
    get exists() { return directories.has(this.uri); }
    create() { directories.add(this.uri); }
    list() { return [...files.keys()].filter(path => path.startsWith(this.uri + '/') && !path.slice(this.uri.length + 1).includes('/')).map(path => new File(path)); }
  }
  class File {
    constructor(...parts) { this.uri = uri(parts); }
    get name() { return this.uri.split('/').at(-1); }
    get extension() { return '.' + this.name.split('.').at(-1); }
    get exists() { return files.has(this.uri); }
    async copy(target) { files.set(target.uri, files.get(this.uri)); }
    async digest() { return require('node:crypto').createHash('md5').update(files.get(this.uri)).digest('hex'); }
    get size() { return files.get(this.uri)?.length ?? 0; }
    async text() { return files.get(this.uri); }
    async write(text) { await new Promise(resolve => setImmediate(resolve)); files.set(this.uri, text); }
    move(target) { files.set(target.uri, files.get(this.uri)); files.delete(this.uri); }
    delete() { files.delete(this.uri); }
    open() { return { readBytes: async () => Uint8Array.from([73, 68, 51]), close() {} }; }
  }
  return { File, Directory, Paths: { document: '/documents', availableDiskSpace: 1e9 }, files };
}
const song = id => ({ id, title: id, artist: 'Artist', source: 'authorized-download', sourceUrl: `https://example.com/${id}`, format: 'mp3', audioFile: `musics/${id}.mp3`, downloadedAt: '', favorite: false, downloadStatus: 'completed' });

test('concurrent library saves and favorites survive a fresh module load', async () => {
  const native = filesystem();
  const deps = { 'expo-file-system': native };
  const storage = load('src/services/musicStorage.ts', deps);
  for (const id of ['a', 'b']) native.files.set(`/documents/Tempo/musics/${id}.mp3`, 'ID3audio');
  await Promise.all([storage.saveLocalSong(song('a')), storage.saveLocalSong(song('b'))]);
  await storage.toggleLocalFavorite('a');
  const restarted = load('src/services/musicStorage.ts', deps);
  const songs = await restarted.listLocalSongs();
  assert.equal(songs.length, 2);
  assert.equal(songs.find(s => s.id === 'a').favorite, true);
  await restarted.removeLocalSong('a');
  assert.equal(native.files.has('/documents/Tempo/musics/a.mp3'), false);
  assert.equal((await restarted.listLocalSongs()).length, 1);
});

test('corrupt metadata remains intact and blocks destructive writes', async () => {
  const native = filesystem();
  native.files.set('/documents/Tempo/data/songs.json', '{invalid');
  const storage = load('src/services/musicStorage.ts', { 'expo-file-system': native });
  await assert.rejects(storage.saveLocalSong(song('a')), /preserved/);
  assert.equal(native.files.get('/documents/Tempo/data/songs.json'), '{invalid');
});

test('download lock prevents simultaneous duplicates; cancelled source can retry', async () => {
  const native = filesystem();
  const storage = load('src/services/musicStorage.ts', { 'expo-file-system': native });
  let finish;
  native.File.downloadFileAsync = (url, file, options) => new Promise((resolve, reject) => {
    options.signal?.addEventListener('abort', () => reject(Error('aborted')));
    finish = () => { native.files.set(file.uri, 'ID3audio'); resolve(file); };
  });
  const manager = load('src/services/downloadManager.ts', {
    '@/src/services/importMusic': { probeDuration: async () => 90 },
    'expo-file-system': native,
    '@/src/services/musicStorage': storage,
    '@/src/services/downloadPreparation': { prepareDownload: async () => ({ id: 'test', extension: 'mp3', url: 'http://10.0.2.2:8000/api/downloads/test/file' }), discardPreparedDownload: async () => {} },
  });
  const first = manager.downloadSong(song('a'));
  await assert.rejects(manager.downloadSong(song('a')), /already downloading/);
  await new Promise(resolve => setImmediate(resolve));
  manager.cancelDownload(song('a').sourceUrl);
  await assert.rejects(first, /cancelled/);
  assert.equal(manager.isDownloading(song('a').sourceUrl), false);
  const retry = manager.downloadSong(song('a'));
  await new Promise(resolve => setImmediate(resolve));
  finish();
  const result = await retry;
  assert.equal(result.downloadStatus, 'completed');
  await assert.rejects(manager.downloadSong(song('a')), /already downloaded/);
});

test('local next and previous stay inside offline library', () => {
  const { create } = require('zustand');
  const { usePlayer } = load('src/store/player.ts', { zustand: { create }, '@/src/data/mockMusic': { tracks: [{ id: 'demo' }] } });
  usePlayer.getState().setLibrary([song('a'), song('b')]);
  usePlayer.getState().play(song('a'));
  usePlayer.getState().next();
  assert.equal(usePlayer.getState().currentTrack.id, 'b');
  usePlayer.getState().previous();
  assert.equal(usePlayer.getState().currentTrack.id, 'a');
  usePlayer.getState().setLibrary([]);
  assert.equal(usePlayer.getState().isPlaying, false);
});


const provider = { '@/src/services/providers/backendProvider': { backendUrl: 'http://10.0.2.2:8000', getBackendUrl: async () => 'http://10.0.2.2:8000' } };
const jsonResponse = (data, ok = true) => ({ ok, status: ok ? 200 : 422, json: async () => data });

test('slow conversion is polled before starting the native transfer', async () => {
  const calls = [];
  let polls = 0;
  const preparation = load('src/services/downloadPreparation.ts', provider, {
    fetch: async (url, options) => {
      calls.push({ url, method: options?.method });
      if (options?.method === 'POST') {
        const payload = JSON.parse(options.body);
        assert.equal(payload.authorized, true);
        assert.equal(payload.quality, 192);
        return jsonResponse({ id: 'slow', status: 'preparing' });
      }
      return jsonResponse({ id: 'slow', status: ++polls < 3 ? 'preparing' : 'ready', extension: 'mp3' });
    },
    setTimeout: (callback, ms) => setTimeout(callback, ms === 1000 ? 0 : ms),
  });
  const ready = await preparation.prepareDownload(song('a'), new AbortController().signal);
  assert.equal(polls, 3);
  assert.equal(ready.url, 'http://10.0.2.2:8000/api/downloads/slow/file');
  assert.equal(calls.some(call => call.url.endsWith('/file')), false);
});

test('preparation returns useful backend errors and deletes failed jobs', async () => {
  const methods = [];
  const preparation = load('src/services/downloadPreparation.ts', provider, {
    fetch: async (_url, options) => {
      methods.push(options?.method);
      if (options?.method === 'POST') return jsonResponse({ id: 'failed', status: 'preparing' });
      if (options?.method === 'DELETE') return { ok: true };
      return jsonResponse({ id: 'failed', status: 'failed', detail: 'Source is restricted.' });
    },
  });
  await assert.rejects(preparation.prepareDownload(song('a'), new AbortController().signal), /restricted/);
  assert.equal(methods.at(-1), 'DELETE');
});

test('cancel while conversion is pending deletes job without file download', async () => {
  let cancelled = false;
  let didPoll;
  const polled = new Promise(resolve => { didPoll = resolve; });
  const preparation = load('src/services/downloadPreparation.ts', provider, {
    fetch: async (url, options) => {
      assert.equal(url.endsWith('/file'), false);
      if (options?.method === 'POST') return jsonResponse({ id: 'pending', status: 'preparing' });
      if (options?.method === 'DELETE') { cancelled = true; return { ok: true }; }
      didPoll();
      return jsonResponse({ id: 'pending', status: 'preparing' });
    },
  });
  const controller = new AbortController();
  const pending = preparation.prepareDownload(song('a'), controller.signal);
  await polled;
  controller.abort();
  await assert.rejects(pending, /cancelled/);
  assert.equal(cancelled, true);
});


test('original audio keeps its real extension in persisted metadata', async () => {
  const native = filesystem();
  native.File.prototype.open = () => ({ readBytes: async () => Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3]), close() {} });
  native.File.downloadFileAsync = async (_url, file) => { native.files.set(file.uri, 'original audio'); return file; };
  const storage = load('src/services/musicStorage.ts', { 'expo-file-system': native });
  const manager = load('src/services/downloadManager.ts', {
    '@/src/services/importMusic': { probeDuration: async () => 90 },
    'expo-file-system': native,
    '@/src/services/musicStorage': storage,
    '@/src/services/downloadPreparation': {
      prepareDownload: async () => ({ id: 'original', extension: 'webm', url: 'http://10.0.2.2:8000/api/downloads/original/file' }),
      discardPreparedDownload: async () => {},
    },
  });
  const downloaded = await manager.downloadSong({ ...song('original'), format: 'original' });
  assert.equal(downloaded.format, 'webm');
  assert.equal(downloaded.audioFile.endsWith('.webm'), true);
  assert.equal(native.files.get('/documents/Tempo/' + downloaded.audioFile), 'original audio');
  const restarted = load('src/services/musicStorage.ts', { 'expo-file-system': native });
  assert.equal((await restarted.listLocalSongs())[0].format, 'webm');
});

test('original preference reaches backend without requesting MP3 conversion', async () => {
  const preparation = load('src/services/downloadPreparation.ts', provider, {
    fetch: async (_url, options) => {
      if (options?.method === 'POST') {
        assert.equal(JSON.parse(options.body).format, 'original');
        return jsonResponse({ id: 'original', status: 'preparing' });
      }
      return jsonResponse({ id: 'original', status: 'ready', extension: 'm4a' });
    },
  });
  const prepared = await preparation.prepareDownload({ ...song('a'), format: 'original' }, new AbortController().signal);
  assert.equal(prepared.extension, 'm4a');
});


test('missing files do not erase metadata, and safe backup recovers valid entries', async () => {
  const native = filesystem();
  const storage = load('src/services/musicStorage.ts', { 'expo-file-system': native });
  native.files.set('/documents/Tempo/musics/a.mp3', 'ID3audio');
  await storage.saveLocalSong(song('a'));
  await storage.saveLocalSong(song('b'));
  await storage.listLocalSongs();
  assert.equal(JSON.parse(native.files.get('/documents/Tempo/data/songs.json')).length, 2);
  native.files.set('/documents/Tempo/data/songs.json', 'corrupt');
  assert.equal((await storage.listLocalSongs())[0].id, 'a');
  assert.equal(native.files.get('/documents/Tempo/data/songs.json'), 'corrupt');
  await storage.recoverLibrary();
  assert.equal((await storage.listLocalSongs()).length, 1);
  assert.equal([...native.files.keys()].some(path => path.includes('songs.corrupt-')), true);
});

test('writing after backup recovery preserves the original corrupt metadata', async () => {
  const native = filesystem();
  const storage = load('src/services/musicStorage.ts', { 'expo-file-system': native });
  native.files.set('/documents/Tempo/musics/a.mp3', 'ID3audio');
  await storage.saveLocalSong(song('a'));
  await storage.saveLocalSong(song('b'));
  native.files.set('/documents/Tempo/data/songs.json', 'corrupt original');
  await storage.toggleLocalFavorite('a');
  assert.equal((await storage.listLocalSongs())[0].favorite, true);
  const preserved = [...native.files.entries()].find(([path]) => path.includes('songs.corrupt-'));
  assert.equal(preserved[1], 'corrupt original');
  assert.equal(JSON.parse(native.files.get('/documents/Tempo/data/songs.json.bak'))[0].id, 'a');
});

test('playlist edits serialize, survive restart, and song deletion leaves playlist safely resolvable', async () => {
  const native = filesystem();
  const storage = load('src/services/musicStorage.ts', { 'expo-file-system': native });
  native.files.set('/documents/Tempo/musics/a.mp3', 'ID3audio');
  await storage.saveLocalSong(song('a'));
  const deps = { zustand: require('zustand'), '@/src/services/musicStorage': storage };
  const { useLibrary } = load('src/store/library.ts', deps);
  await useLibrary.getState().refresh();
  await useLibrary.getState().editPlaylist(all => [...all, { id: 'p', name: 'My playlist', songIds: ['a'], createdAt: '' }]);
  await Promise.all([useLibrary.getState().editPlaylist(all => all.map(p => ({ ...p, name: 'Renamed' }))), useLibrary.getState().editPlaylist(all => all.map(p => ({ ...p, songIds: [...p.songIds, 'b'] })))]);
  const restarted = load('src/store/library.ts', deps).useLibrary;
  await restarted.getState().refresh();
  assert.equal(restarted.getState().playlists[0].name, 'Renamed');
  assert.equal(restarted.getState().playlists[0].songIds.length, 2);
  await storage.removeLocalSong('a');
  await restarted.getState().refresh();
  assert.equal(restarted.getState().songs.length, 0);
  await restarted.getState().editPlaylist(all => all.filter(p => p.id !== 'p'));
  assert.equal(JSON.parse(native.files.get('/documents/Tempo/data/playlists.json')).length, 0);
});

test('queue restore, repeat completion and empty library never select a demo song', () => {
  const { usePlayer } = load('src/store/player.ts', { zustand: require('zustand') });
  assert.equal(usePlayer.getState().currentTrack, null);
  usePlayer.getState().setLibrary([song('a'), song('b')]);
  usePlayer.getState().restore({ queue: ['b', 'a', 'missing'], currentId: 'a', position: 42, repeat: 'off', shuffle: false, volume: 0.5 });
  assert.equal(usePlayer.getState().position, 42);
  assert.equal(usePlayer.getState().queue.length, 2);
  assert.equal(usePlayer.getState().isPlaying, false);
  usePlayer.getState().play();
  usePlayer.getState().finish();
  assert.equal(usePlayer.getState().isPlaying, false);
  usePlayer.setState({ repeat: 'all' });
  usePlayer.getState().finish();
  assert.equal(usePlayer.getState().currentTrack.id, 'b');
  usePlayer.setState({ repeat: 'one', position: 30 });
  usePlayer.getState().finish();
  assert.equal(usePlayer.getState().currentTrack.id, 'b');
  assert.equal(usePlayer.getState().position, 0);
});

test('MP3 import validates, measures duration, and avoids duplicate content', async () => {
  const native = filesystem();
  native.files.set('/external/song.mp3', 'ID3audio');
  const storage = load('src/services/musicStorage.ts', { 'expo-file-system': native });
  native.File.pickFileAsync = async () => ({ canceled: false, result: [new native.File('/external/song.mp3')] });
  let removed = 0;
  const importer = load('src/services/importMusic.ts', {
    'expo-document-picker': { getDocumentAsync: async () => ({ canceled: false, assets: [{ uri: '/external/song.mp3', name: 'Owned song.mp3' }] }) },
    'expo-audio': { createAudioPlayer: () => ({ isLoaded: true, duration: 95, remove: () => removed++ }) },
    'expo-file-system': native,
    './musicStorage': storage,
    './id3': { parseId3: () => ({ title: 'Recorded song', artist: 'My artist', album: 'My album' }) },
  });
  await importer.importMusic();
  await importer.importMusic();
  const songs = await storage.listLocalSongs();
  assert.equal(songs.length, 1);
  assert.equal(songs[0].artist, 'My artist');
  assert.equal(songs[0].duration, 95);
  assert.equal(removed, 1);
});

test('insufficient storage prevents saving a new file', () => {
  const native = filesystem();
  native.Paths.availableDiskSpace = 1024;
  const storage = load('src/services/musicStorage.ts', { 'expo-file-system': native });
  assert.throws(() => storage.assertStorageSpace(5000), /Not enough storage/);
});

test('ID3 text metadata is parsed from a real binary tag layout', () => {
  const { parseId3 } = load('src/services/id3.ts', {});
  const value = Buffer.from([3, ...Buffer.from('Owned recording')]);
  const frame = Buffer.concat([Buffer.from('TIT2'), Buffer.from([0,0,0,value.length,0,0]), value]);
  const header = Buffer.from([73,68,51,3,0,0,0,0,0,frame.length]);
  assert.equal(parseId3(new Uint8Array(Buffer.concat([header, frame]))).title, 'Owned recording');
});

test('name search uses embedded endpoint and rejects URL input', async () => {
  const calls = [];
  const backend = load('src/services/providers/backendProvider.ts', {
    '@/src/services/embeddedEngine': { startEmbeddedEngine: () => Promise.resolve('http://127.0.0.1:1234/session') },
  }, { fetch: async url => {
    calls.push(url);
    return jsonResponse([{ id: 'song', title: 'Owned song', artist: 'Artist', source_url: 'https://www.youtube.com/watch?v=abcdefghijk', downloadable: true, duration: 25, provider: 'Tempo on-device' }]);
  }});
  const results = await backend.backendProvider.search('song artist');
  assert.equal(calls[0], 'http://127.0.0.1:1234/session/api/search?query=song%20artist');
  assert.equal(results[0].format, 'original');
  assert.equal(results[0].title, 'Owned song');
  await assert.rejects(backend.backendProvider.search('https://example.com/song'), /song or artist name/);
});

test('embedded engine initializes once and can retry after a startup failure', async () => {
  let calls = 0;
  const engine = load('src/services/embeddedEngine.ts', {
    '@/modules/tempo-engine': { start: async () => { calls++; if (calls === 1) throw Error('initialization failed'); return { baseUrl: 'http://127.0.0.1:1234/session' }; } },
  });
  await assert.rejects(engine.startEmbeddedEngine(), /initialization/);
  await Promise.all([engine.startEmbeddedEngine(), engine.startEmbeddedEngine()]);
  assert.equal(calls, 2);
});

class NativePlaylist {
  sources = []; currentIndex = 0; currentTime = 0; duration = 120; playing = false; isBuffering = false; isLoaded = true;
  volume = 1; loop = 'none'; listeners = new Map(); clears = 0; metadata = null; active = false;
  get trackCount() { return this.sources.length; }
  get currentStatus() { return { currentIndex: this.currentIndex, currentTime: this.currentTime, duration: this.duration, playing: this.playing, isBuffering: this.isBuffering, isLoaded: this.isLoaded, trackCount: this.trackCount }; }
  addListener(name, handler) { this.listeners.set(name, handler); return { remove: () => this.listeners.delete(name) }; }
  emit() { this.listeners.get('playlistStatusUpdate')?.(this.currentStatus); }
  clear() { this.sources = []; this.currentIndex = 0; this.currentTime = 0; this.clears++; }
  add(source) { this.sources.push(source); }
  skipTo(index) { this.currentIndex = index; this.currentTime = 0; }
  async seekTo(position) { this.currentTime = position; }
  play() { this.playing = true; }
  pause() { this.playing = false; }
  next() { if (this.currentIndex < this.trackCount - 1) this.skipTo(this.currentIndex + 1); this.emit(); }
  previous() { if (this.currentIndex > 0) this.skipTo(this.currentIndex - 1); this.emit(); }
  setActiveForLockScreen(active, metadata) { this.active = active; this.metadata = metadata; }
  updateLockScreenMetadata(metadata) { this.metadata = metadata; }
  clearLockScreenControls() { this.active = false; }
}

test('system media controls update the shared queue, position and metadata without replay loops', async () => {
  const playerModule = load('src/store/player.ts', { zustand: require('zustand') });
  const store = playerModule.usePlayer;
  const { connectPlayback } = load('src/services/playbackBridge.ts', {});
  const native = new NativePlaylist();
  const played = [];
  store.getState().setLibrary([song('a'), song('b')]);
  store.getState().play(song('a'));
  const disconnect = connectPlayback(native, store, { audioUri: s => s.audioFile, artworkUri: () => 'file:///art.jpg', recordPlay: async id => played.push(id), updateDuration: async () => {} });
  playerModule.bindPlaybackCommands({ next: () => native.next(), previous: () => native.previous() });
  assert.equal(native.active, true);
  assert.deepEqual(Array.from(native.sources, s => s.name), ['a', 'b']);
  native.currentTime = 18; native.emit();
  assert.equal(store.getState().position, 18);
  native.pause(); native.emit();
  assert.equal(store.getState().isPlaying, false);
  store.getState().toggle();
  assert.equal(native.playing, true);
  native.next();
  assert.equal(store.getState().currentTrack.id, 'b');
  assert.equal(native.metadata.title, 'b');
  assert.equal(native.metadata.artworkUrl, 'file:///art.jpg');
  const rebuilt = native.clears;
  store.getState().setLibrary([{ ...song('a'), favorite: true }, song('b')]);
  assert.equal(native.clears, rebuilt, 'metadata refresh must not reload/restart the queue');
  store.getState().previous();
  assert.equal(native.currentIndex, 0);
  assert.deepEqual(played, ['a', 'b', 'a']);
  disconnect(); playerModule.bindPlaybackCommands();
  assert.equal(native.active, false);
  assert.equal(native.playing, false);
});

test('native playlist restores paused position and implements repeat and a shared shuffle order', () => {
  const { usePlayer: store } = load('src/store/player.ts', { zustand: require('zustand') });
  const { connectPlayback } = load('src/services/playbackBridge.ts', {});
  const native = new NativePlaylist();
  const tracks = ['a', 'b', 'c'].map(song);
  store.getState().setLibrary(tracks);
  store.getState().restore({ queue: ['a', 'b', 'c'], currentId: 'b', position: 42, repeat: 'one', shuffle: false, volume: .4 });
  const disconnect = connectPlayback(native, store, { audioUri: s => s.audioFile, artworkUri: () => undefined, recordPlay: async () => {}, updateDuration: async () => {} });
  assert.equal(native.currentIndex, 1);
  assert.equal(native.currentTime, 42);
  assert.equal(native.playing, false);
  assert.equal(native.loop, 'single');
  assert.equal(native.volume, .4);
  store.getState().setShuffle(true);
  assert.equal(store.getState().queue[0], 'b');
  assert.deepEqual(Array.from(native.sources, s => s.name), Array.from(store.getState().queue));
  assert.equal(native.currentTime, 42);
  store.getState().setShuffle(false);
  assert.deepEqual(Array.from(native.sources, s => s.name), ['a', 'b', 'c']);
  disconnect();
});

test('playlist queue skips existing/duplicate tracks, retains successes, retries failures, and persists source order', async () => {
  const { create } = require('zustand');
  const native = filesystem();
  const storage = load('src/services/musicStorage.ts', { 'expo-file-system': native });
  const library = load('src/store/library.ts', { zustand: { create }, '@/src/services/musicStorage': storage }).useLibrary;
  native.files.set('/documents/Tempo/musics/a.mp3', 'ID3audio');
  await storage.saveLocalSong(song('a'));
  await library.getState().refresh();
  await library.getState().editPlaylist(() => [{ id: 'p', name: 'Owned playlist', songIds: [], createdAt: '' }]);
  const calls = []; let fail = true;
  const deps = { zustand: { create }, '@/src/services/musicStorage': storage, '@/src/store/library': { useLibrary: library }, '@/src/store/player': { usePlayer: { getState: () => ({ setLibrary() {} }) } }, '@/src/services/downloadManager': {
    cancelDownload() {}, downloadSong: async (s, progress, phase) => {
      calls.push(s.id); phase({ phase: 'source_download', percent: 50 });
      if (s.id === 'b' && fail) throw Error('Interrupted transfer');
      native.files.set(`/documents/Tempo/musics/${s.id}.mp3`, 'ID3audio');
      await storage.saveLocalSong(song(s.id)); return song(s.id);
    },
  } };
  const queue = load('src/store/downloads.ts', deps).useDownloadQueue;
  await queue.getState().hydrate();
  await queue.getState().enqueueBatch('Owned playlist', [{ song: song('a') }, { song: song('b') }, { song: song('b') }, { error: 'Private track' }, { song: song('c') }], 'p');
  const drain = async () => { for (let i = 0; i < 80; i++) await new Promise(resolve => setImmediate(resolve)); };
  await drain();
  assert.deepEqual(calls, ['b', 'c']);
  assert.equal(library.getState().songs.some(s => s.id === 'c'), true);
  assert.deepEqual(Array.from(library.getState().playlists[0].songIds), ['a', 'c']);
  const summary = load('src/services/downloadSummary.ts', {}).summarizeBatch;
  const batch = queue.getState().batches[0];
  assert.equal(summary(batch, queue.getState().items, library.getState().songs)[2].state, 'skipped');
  assert.equal(summary(batch, queue.getState().items, library.getState().songs)[0].detail, 'Already downloaded · skipped');
  fail = false; queue.getState().retryBatch(batch.id); await drain();
  assert.deepEqual(calls, ['b', 'c', 'b']);
  assert.deepEqual(Array.from(library.getState().playlists[0].songIds), ['a', 'b', 'c']);
  const restarted = load('src/store/downloads.ts', deps).useDownloadQueue;
  await restarted.getState().hydrate();
  assert.equal(restarted.getState().batches.length, 1);
  assert.equal(restarted.getState().items.filter(i => i.status === 'completed').length, 2);
  assert.deepEqual(Array.from(library.getState().playlists[0].songIds), ['a', 'b', 'c']);
});

test('queue cancellation removes pending work and interrupted jobs restore as retryable failures', async () => {
  const { create } = require('zustand');
  let release;
  let saved;
  let songs = [];
  const library = { getState: () => ({ songs, playlists: [], refresh: async () => {}, editPlaylist: async () => {} }) };
  const deps = { zustand: { create }, '@/src/services/musicStorage': { readState: async () => saved ?? { items: [], batches: [] }, writeState: async (_, value) => { saved = JSON.parse(JSON.stringify(value)); } }, '@/src/store/library': { useLibrary: library }, '@/src/store/player': { usePlayer: { getState: () => ({ setLibrary() {} }) } }, '@/src/services/downloadManager': {
    cancelDownload() {}, downloadSong: s => new Promise(resolve => { release = () => { songs.push(song(s.id)); resolve(song(s.id)); }; }),
  } };
  const queue = load('src/store/downloads.ts', deps).useDownloadQueue;
  await queue.getState().hydrate();
  queue.getState().enqueue(song('a')); queue.getState().enqueue(song('b'));
  queue.getState().cancel(song('b'));
  for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve));
  const restarted = load('src/store/downloads.ts', deps).useDownloadQueue;
  await restarted.getState().hydrate();
  assert.equal(restarted.getState().items.find(i => i.song.id === 'a').status, 'failed');
  assert.match(restarted.getState().items.find(i => i.song.id === 'a').error, /Interrupted/);
  release();
  for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(queue.getState().items.find(i => i.song.id === 'b').status, 'failed');
  assert.equal(songs.length, 1);
});

test('a file that cannot be decoded never enters the offline library', async () => {
  const native = filesystem();
  native.File.downloadFileAsync = async (_, file) => { native.files.set(file.uri, 'ID3broken'); return file; };
  const storage = load('src/services/musicStorage.ts', { 'expo-file-system': native });
  const manager = load('src/services/downloadManager.ts', {
    'expo-file-system': native, '@/src/services/musicStorage': storage,
    '@/src/services/importMusic': { probeDuration: async () => { throw Error('Audio could not be loaded'); } },
    '@/src/services/downloadPreparation': { prepareDownload: async () => ({ id: 'j', extension: 'mp3', url: 'https://example.com/file' }), discardPreparedDownload: async () => {} },
  });
  await assert.rejects(manager.downloadSong(song('broken')), /could not be loaded/);
  assert.equal((await storage.listLocalSongs()).length, 0);
  assert.equal([...native.files.keys()].some(p => p.includes('/musics/')), false);
});

test('playlist summary does not report deleted audio as saved offline', () => {
  const { summarizeBatch } = load('src/services/downloadSummary.ts', {});
  const rows = summarizeBatch({ id: 'b', title: 'Owned playlist', entries: [{ song: song('a') }] }, [{ song: song('a'), status: 'completed', progress: 100 }], []);
  assert.equal(rows[0].state, 'failed');
  assert.match(rows[0].detail, /no longer/);
});

test('playlist name search returns cards without fetching tracks, then resolves the chosen source', async () => {
  const calls = [];
  const backend = load('src/services/providers/backendProvider.ts', { '@/src/services/embeddedEngine': { startEmbeddedEngine: () => Promise.resolve('http://127.0.0.1:1234/session') } }, { fetch: async url => {
    calls.push(url);
    return url.includes('/api/playlists/search?')
      ? jsonResponse([{ id: 'PLown', title: 'Own playlist', artist: 'Curator', source_url: 'https://www.youtube.com/playlist?list=PLown', thumbnail_url: 'https://example.com/art', track_count: 12 }])
      : jsonResponse({ title: 'Own playlist', source_url: 'https://www.youtube.com/playlist?list=PLown', tracks: [{ media: { id: 'a', title: 'Owned A', artist: 'A', duration: 1, source_url: 'https://www.youtube.com/watch?v=abcdefghijk', downloadable: true } }] });
  } });
  const results = await backend.searchPlaylists('own music');
  assert.equal(calls.length, 1);
  assert.match(calls[0], /api\/playlists\/search\?query=own%20music/);
  assert.equal(results[0].trackCount, 12);
  const resolved = await backend.resolvePlaylist(results[0].sourceUrl);
  assert.equal(calls.length, 2);
  assert.equal(resolved.sourceUrl, results[0].sourceUrl);
  assert.equal(resolved.entries[0].song.title, 'Owned A');
  await assert.rejects(backend.searchPlaylists('https://example.com/a'), /playlist or artist name/);
});

test('Expo Go does not attempt service controls, and metadata refresh does not seek or replay audio', () => {
  const store = load('src/store/player.ts', { zustand: require('zustand') }).usePlayer;
  const { connectPlayback } = load('src/services/playbackBridge.ts', {});
  const native = new NativePlaylist();
  let lockCalls = 0; let seeks = 0; let loopWrites = 0; let volumeWrites = 0;
  native.setActiveForLockScreen = () => { lockCalls++; throw Error('Service missing in Expo Go'); };
  native.seekTo = async position => { seeks++; native.currentTime = position; };
  Object.defineProperty(native, 'loop', { configurable: true, set() { loopWrites++; } });
  Object.defineProperty(native, 'volume', { configurable: true, set() { volumeWrites++; } });
  store.getState().setLibrary([song('a'), song('b')]);
  const stop = connectPlayback(native, store, { audioUri: s => `file:///${s.id}.mp3`, artworkUri: () => undefined, recordPlay: async () => {}, updateDuration: async () => {}, lockScreenControls: false });
  store.getState().play(song('a'));
  assert.equal(native.playing, true);
  assert.equal(seeks, 0);
  native.currentTime = 24; native.emit();
  for (let i = 0; i < 5; i++) store.getState().setLibrary([{ ...song('a'), favorite: i % 2 === 0 }, song('b')]);
  assert.equal(native.currentTime, 24);
  assert.equal(native.clears, 1);
  assert.equal(loopWrites, 1);
  assert.equal(volumeWrites, 1);
  assert.equal(lockCalls, 0);
  assert.equal(seeks, 0);
  stop();
});

test('background control capability distinguishes Expo Go, custom Android and web', () => {
  const capability = (inGo, OS) => load('src/services/playbackCapabilities.ts', { expo: { isRunningInExpoGo: () => inGo }, 'react-native': { Platform: { OS } } });
  assert.equal(capability(true, 'android').supportsBackgroundControls, false);
  assert.match(capability(true, 'android').playbackNotice, /Tempo build/);
  assert.equal(capability(false, 'android').supportsBackgroundControls, true);
  assert.equal(capability(false, 'web').supportsBackgroundControls, false);
});
