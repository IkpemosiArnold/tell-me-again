// A small ZIP writer (stored, no compression). Audio is already compressed, so deflate would
// save almost nothing and cost a dependency. Any unzip tool on a phone or laptop opens it.
// File names are UTF-8 (general purpose flag bit 11), so "Ìyá Àgbà.txt" survives.

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes, crc = 0) {
  let c = ~crc >>> 0;
  for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

/** DOS time and date fields for a JS Date (local time, 2-second resolution). */
export function dosDateTime(d = new Date()) {
  const year = Math.max(1980, d.getFullYear());
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

async function toBytes(data) {
  if (data instanceof Uint8Array) return data;
  if (typeof data === "string") return new TextEncoder().encode(data);
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (data && typeof data.arrayBuffer === "function") return new Uint8Array(await data.arrayBuffer());
  throw new TypeError("zip: unsupported entry data");
}

/** A path that is safe inside an archive: no leading slash, no "..", no control characters. */
export function safePath(name) {
  return String(name)
    .replace(/\\/g, "/")
    .split("/")
    .map((p) => p.replace(/[\u0000-\u001f<>:"|?*]/g, "").trim())
    .filter((p) => p && p !== "." && p !== "..")
    .join("/");
}

/**
 * entries: [{ name, data: string | Uint8Array | Blob, date? }]
 * Resolves a Blob of type application/zip.
 */
export async function makeZip(entries, { now = new Date() } = {}) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  const seen = new Set();
  for (const e of entries) {
    let name = safePath(e.name);
    if (!name) continue;
    // two entries with one name would shadow each other in most unzip tools
    for (let i = 2; seen.has(name); i++) name = name.replace(/(\.[^./]+)?$/, (ext) => ` (${i})${ext || ""}`);
    seen.add(name);
    const bytes = await toBytes(e.data);
    const nameBytes = enc.encode(name);
    const crc = crc32(bytes);
    const { time, date } = dosDateTime(e.date || now);
    if (bytes.length > 0xfffffffe || offset > 0xfffffffe) throw new RangeError("zip: archive over 4 GB is not supported");

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, bytes.length, true);
    local.setUint32(22, bytes.length, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), nameBytes, bytes);

    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, 0x031e, true); // made by: unix, 3.0
    cen.setUint16(6, 20, true);
    cen.setUint16(8, 0x0800, true);
    cen.setUint16(10, 0, true);
    cen.setUint16(12, time, true);
    cen.setUint16(14, date, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, bytes.length, true);
    cen.setUint32(24, bytes.length, true);
    cen.setUint16(28, nameBytes.length, true);
    cen.setUint16(30, 0, true);
    cen.setUint16(32, 0, true);
    cen.setUint16(34, 0, true);
    cen.setUint16(36, 0, true);
    cen.setUint32(38, (0o100644 << 16) >>> 0, true); // -rw-r--r--
    cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), nameBytes);

    offset += 30 + nameBytes.length + bytes.length;
  }
  const cenSize = central.reduce((a, p) => a + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, seen.size, true);
  end.setUint16(10, seen.size, true);
  end.setUint32(12, cenSize, true);
  end.setUint32(16, offset, true);
  end.setUint16(20, 0, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: "application/zip" });
}

/** Read a stored ZIP back into { name: Uint8Array } (for tests and for opening an archive again). */
export async function readZip(blobOrBytes) {
  const buf = blobOrBytes instanceof Uint8Array ? blobOrBytes : new Uint8Array(await blobOrBytes.arrayBuffer());
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a ZIP file.");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out = {};
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error("Damaged ZIP directory.");
    const method = dv.getUint16(p + 10, true);
    const crc = dv.getUint32(p + 16, true);
    const size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const at = dv.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    if (method !== 0) throw new Error(`"${name}" is compressed; only archives made by this app can be opened.`);
    const lNameLen = dv.getUint16(at + 26, true);
    const lExtraLen = dv.getUint16(at + 28, true);
    const start = at + 30 + lNameLen + lExtraLen;
    const bytes = buf.slice(start, start + size);
    if (crc32(bytes) !== crc) throw new Error(`"${name}" is damaged.`);
    out[name] = bytes;
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}
