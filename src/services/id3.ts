export type AudioTags = { title?: string; artist?: string; album?: string; artwork?: Uint8Array };
function text(bytes: Uint8Array) {
  if (!bytes.length) return '';
  const encoding = bytes[0]; const data = bytes.subarray(1);
  if (encoding === 3) return new TextDecoder().decode(data).replace(/\0/g, '').trim();
  if (encoding === 0) return Array.from(data, byte => String.fromCharCode(byte)).join('').replace(/\0/g, '').trim();
  let little = data[0] === 0xff && data[1] === 0xfe;
  const start = data[0] === 0xff || data[0] === 0xfe ? 2 : 0;
  if (encoding === 2) little = false;
  let value = '';
  for (let i = start; i + 1 < data.length; i += 2) value += String.fromCharCode(little ? data[i] + data[i + 1] * 256 : data[i] * 256 + data[i + 1]);
  return value.replace(/\0/g, '').trim();
}
export function parseId3(bytes: Uint8Array): AudioTags {
  const tags: AudioTags = {};
  if (bytes[0] !== 73 || bytes[1] !== 68 || bytes[2] !== 51 || ![3,4].includes(bytes[3]) || (bytes[5] & 0xc0)) return tags;
  const sync = (at: number) => (bytes[at] & 127) * 2097152 + (bytes[at + 1] & 127) * 16384 + (bytes[at + 2] & 127) * 128 + (bytes[at + 3] & 127);
  const end = Math.min(bytes.length, 10 + sync(6));
  for (let at = 10; at + 10 <= end;) {
    const id = String.fromCharCode(...bytes.subarray(at, at + 4));
    const size = bytes[3] === 4 ? sync(at + 4) : bytes[at + 4] * 16777216 + bytes[at + 5] * 65536 + bytes[at + 6] * 256 + bytes[at + 7];
    if (!size || size < 0 || at + 10 + size > end) break;
    const value = bytes.subarray(at + 10, at + 10 + size);
    if (bytes[at + 8] === 0 && bytes[at + 9] === 0) {
      if (id === 'TIT2') tags.title = text(value);
      if (id === 'TPE1') tags.artist = text(value);
      if (id === 'TALB') tags.album = text(value);
      if (id === 'APIC') {
        const mimeEnd = value.indexOf(0, 1);
        let start = mimeEnd + 2;
        if (mimeEnd > 0) {
          if (value[0] === 1 || value[0] === 2) { while (start + 1 < value.length && !(value[start] === 0 && value[start + 1] === 0)) start += 2; start += 2; }
          else { while (start < value.length && value[start] !== 0) start++; start++; }
          const picture = value.subarray(start);
          if ((picture[0] === 0xff && picture[1] === 0xd8) || (picture[0] === 137 && picture[1] === 80)) tags.artwork = picture;
        }
      }
    }
    at += size + 10;
  }
  return tags;
}
