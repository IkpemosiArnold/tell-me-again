// Audio helpers: decode any recording (webm/opus from Chrome, mp4/aac from Safari, a .m4a
// or video someone already has) to 16 kHz mono for Whisper, and write WAV for tests.

export const RATE = 16000;

/** Decode a Blob to mono Float32Array at `rate` Hz. */
export async function decodeToMono(blob, rate = RATE) {
  const buf = await blob.arrayBuffer();
  const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
  const ctx = new Ctx();
  let audio;
  try {
    audio = await new Promise((resolve, reject) => {
      // Safari before 14.1 only has the callback form
      const p = ctx.decodeAudioData(buf, resolve, reject);
      p?.then?.(resolve, reject);
    });
  } catch (e) {
    throw Object.assign(new Error("This browser could not read that recording."), { hint: "Try an audio file (m4a, mp3, wav) or record again here.", cause: e });
  } finally {
    ctx.close?.();
  }
  const frames = Math.ceil(audio.duration * rate);
  if (!frames) return new Float32Array(0);
  const off = new OfflineAudioContext(1, frames, rate);
  const src = off.createBufferSource();
  src.buffer = audio;
  src.connect(off.destination);
  src.start();
  const out = await off.startRendering();
  return out.getChannelData(0);
}

/** 16-bit PCM WAV bytes for mono Float32 samples. */
export function encodeWav(samples, rate = RATE) {
  const n = samples.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buf);
}

/** The file extension for a recording's MIME type. */
export function extFor(mime = "") {
  if (/webm/.test(mime)) return "webm";
  if (/ogg/.test(mime)) return "ogg";
  if (/mp4|m4a|aac/.test(mime)) return "m4a";
  if (/mpeg|mp3/.test(mime)) return "mp3";
  if (/wav/.test(mime)) return "wav";
  if (/quicktime/.test(mime)) return "mov";
  return "audio";
}
