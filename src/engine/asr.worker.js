// Whisper in a Web Worker (transformers.js on ONNX Runtime Web, WebAssembly). The audio is
// cut into windows of up to 30 s at quiet points, and each window's lines are sent back as
// soon as they are written, so the family watches the transcript appear.
//
// The large .onnx files come down in resumable pieces kept in the origin private file
// system (download.js), so a dropped connection or a reload carries on from the last byte
// instead of starting again, and each finished file is checked against its SHA-256.
// Adapted from Selects (github.com/IkpemosiArnold/selects, MIT), src/browser/asr.worker.js.
import { env, pipeline } from "@huggingface/transformers";
import { fetchWithRetry, memoryStore, opfsStore, resumableDownload } from "./download.js";
import { planWindows } from "./windows.js";

env.allowLocalModels = false;
env.useBrowserCache = true;

// ONNX Runtime's WebAssembly comes from jsDelivr (pinned to the version transformers.js
// ships with), not from this site, to keep the host's bandwidth tiny. WebKit on the CPU gets
// the plain build: the asyncify build is reported to run away with memory on Safari 26
// (onnxruntime issue 26827), and only WebGPU needs it.
const ua = self.navigator?.userAgent || "";
const webkit = /AppleWebKit/.test(ua) && !/Chrome\/|Chromium\/|Edg\/|Android/.test(ua);
const ortVersion = env.backends?.onnx?.versions?.web;
if (ortVersion && env.backends.onnx.wasm) {
  const base = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ortVersion}/dist/ort-wasm-simd-threaded${webkit ? "" : ".asyncify"}`;
  env.backends.onnx.wasm.wasmPaths = { mjs: `${base}.mjs`, wasm: `${base}.wasm` };
}

const post = (m) => self.postMessage(m);

const BIG = /\.onnx(_data)?$/;
const isBig = (u) => {
  try {
    return BIG.test(new URL(u).pathname);
  } catch {
    return false;
  }
};
const fileOf = (u) => decodeURIComponent(new URL(u).pathname.split("/resolve/")[1]?.split("/").slice(1).join("/") || new URL(u).pathname.split("/").pop());
let storeP = null;
const getStore = () => (storeP ??= opfsStore().then((s) => s || memoryStore()));
let expected = {};
let lastDownloadError = null;
const netFetch = env.fetch;

env.fetch = async (input, init) => {
  const url = String(input?.url || input);
  if (!isBig(url)) return fetchWithRetry(input, init, { fetchImpl: netFetch });
  const store = await getStore();
  // transformers.js asks for byte 0 first to learn the size: answer from what is stored
  if (new Headers(init?.headers).get("range") === "bytes=0-0") {
    const { meta } = await store.info(url);
    if (meta?.size) return new Response(new Uint8Array(1), { status: 206, headers: { "content-range": `bytes 0-0/${meta.size}`, "content-length": "1", "content-type": "application/octet-stream" } });
    return fetchWithRetry(input, init, { fetchImpl: netFetch });
  }
  const file = fileOf(url);
  let last = 0;
  try {
    const blob = await resumableDownload(url, {
      store,
      fetchImpl: netFetch,
      expect: expected[file] || null,
      onProgress: (p) => {
        const now = performance.now();
        if (p.loaded < p.total && now - last < 200) return;
        last = now;
        post({ type: "download", file, loaded: p.loaded, total: p.total, cached: !!p.cached });
      },
    });
    return new Response(blob, { status: 200, headers: { "content-length": String(blob.size), "content-type": "application/octet-stream" } });
  } catch (e) {
    lastDownloadError = e;
    throw e;
  }
};

// large files live in OPFS (above); Cache Storage keeps only the small ones
let smallP = null;
const small = () => (smallP ??= caches.open("tell-me-again-models").catch(() => null));
env.useCustomCache = true;
env.customCache = {
  async match(key) {
    const k = String(key);
    if (isBig(k)) {
      const store = await getStore();
      const { bytes, meta } = await store.info(k);
      if (meta?.done && meta.size === bytes) {
        const blob = await store.blob(k);
        return new Response(blob, { status: 200, headers: { "content-length": String(blob.size), "content-type": "application/octet-stream" } });
      }
      return undefined;
    }
    return (await small())?.match(k);
  },
  async put(key, response) {
    if (isBig(String(key))) return;
    await (await small())?.put(key, response);
  },
};

let asr = null;
let loadedId = null;

async function load({ model }) {
  if (asr && loadedId === model.id) return post({ type: "ready", cached: true });
  lastDownloadError = null;
  expected = model.files || {};
  const t0 = performance.now();
  asr = await pipeline("automatic-speech-recognition", model.id, {
    device: "wasm",
    dtype: model.dtype,
    progress_callback: (p) => {
      if (BIG.test(p.file || "")) return; // reported from the network above
      if (p.status === "progress") post({ type: "download", file: p.file, loaded: p.loaded, total: p.total });
    },
  });
  loadedId = model.id;
  post({ type: "ready", loadSec: +((performance.now() - t0) / 1000).toFixed(1) });
}

async function transcribe({ pcm, rate, offsetSec = 0 }) {
  const wins = planWindows(pcm, rate);
  const t0 = performance.now();
  const lines = [];
  for (let i = 0; i < wins.length; i++) {
    const [a, b] = wins[i];
    const res = await asr(pcm.subarray(a, b), { return_timestamps: true });
    const base = a / rate + offsetSec;
    const got = [];
    for (const c of res.chunks || [{ text: res.text, timestamp: [0, (b - a) / rate] }]) {
      const text = String(c.text || "").trim();
      // whisper writes these for silence or music; they are not words anyone said
      if (!text || /^\[?(blank_audio|music|silence|inaudible)\]?$/i.test(text) || /^\(.*\)$/.test(text)) continue;
      let [s, e] = c.timestamp || [];
      if (!Number.isFinite(s)) s = 0;
      if (!Number.isFinite(e) || e < s) e = Math.min((b - a) / rate, s + 5);
      got.push({ s: +(base + s).toFixed(2), e: +(base + e).toFixed(2), text });
    }
    lines.push(...got);
    post({ type: "lines", lines: got, done: b / rate, total: pcm.length / rate, i, n: wins.length });
  }
  post({ type: "done", lines, wallSec: +((performance.now() - t0) / 1000).toFixed(1) });
}

self.onmessage = async (ev) => {
  const m = ev.data;
  try {
    if (m.type === "load") await load(m);
    else if (m.type === "transcribe") await transcribe(m);
  } catch (err) {
    const e = m.type === "load" && lastDownloadError ? lastDownloadError : err;
    post({ type: "error", during: m.type, name: String(e?.name || ""), message: String(e?.message || e), kind: e?.kind || null, status: e?.status || null, loaded: e?.loaded ?? null, total: e?.total ?? null });
  }
};
