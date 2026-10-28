// The page's side of the speech model: load it (with real download progress), write down
// one recording, and stop at any time. Stopping ends the worker, which frees its memory.
import { SPEECH, speechBytes } from "./models.js";

export function createTranscriber(size = "base") {
  const model = SPEECH[size] || SPEECH.base;
  let worker = null;
  let ready = false;
  let pending = null;

  const start = () => {
    worker = new Worker(new URL("./asr.worker.js", import.meta.url), { type: "module" });
    worker.onmessage = (ev) => pending?.(ev.data);
    worker.onerror = (ev) => pending?.({ type: "error", name: "Error", message: ev.message || "The speech model stopped." });
  };

  /** Resolves when loaded. onProgress({ loaded, total }) across all files. */
  function load({ onProgress } = {}) {
    if (ready) return Promise.resolve();
    if (!worker) start();
    const files = {};
    const total = speechBytes(model);
    return new Promise((resolve, reject) => {
      pending = (m) => {
        if (m.type === "download") {
          files[m.file] = m.loaded || 0;
          const loaded = Object.values(files).reduce((a, b) => a + b, 0);
          onProgress?.({ loaded: Math.min(loaded, total), total });
        } else if (m.type === "ready") {
          ready = true;
          onProgress?.({ loaded: total, total });
          resolve(m);
        } else if (m.type === "error") {
          reject(Object.assign(new Error(m.message), m));
        }
      };
      worker.postMessage({ type: "load", model: { id: model.id, dtype: model.dtype, files: model.files } });
    });
  }

  /** pcm: Float32Array at `rate` Hz. onLines(lines, { done, total }) as each window is written. */
  function transcribe(pcm, rate, { onLines } = {}) {
    if (!ready) return Promise.reject(new Error("The speech model is not loaded."));
    return new Promise((resolve, reject) => {
      pending = (m) => {
        if (m.type === "lines") onLines?.(m.lines, { done: m.done, total: m.total });
        else if (m.type === "done") resolve(m);
        else if (m.type === "error") reject(Object.assign(new Error(m.message), m));
      };
      // a copy goes to the worker; the page keeps its own for playback
      const copy = new Float32Array(pcm);
      worker.postMessage({ type: "transcribe", pcm: copy, rate }, [copy.buffer]);
    });
  }

  function stop() {
    worker?.terminate();
    worker = null;
    ready = false;
    pending?.({ type: "error", name: "AbortError", message: "Stopped." });
    pending = null;
  }

  return { model, bytes: speechBytes(model), load, transcribe, stop, get ready() { return ready; } };
}
