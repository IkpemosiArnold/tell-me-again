// Recording from the microphone, with a live loudness level for the lamp, pause and resume.
// Each piece MediaRecorder hands over is passed to onChunk, so the page can save as it goes
// and a closed tab loses at most a few seconds.

export function pickMime() {
  const MR = globalThis.MediaRecorder;
  if (!MR?.isTypeSupported) return "";
  for (const t of ["audio/webm;codecs=opus", "audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"]) {
    if (MR.isTypeSupported(t)) return t;
  }
  return "";
}

export function canRecord() {
  return !!(globalThis.navigator?.mediaDevices?.getUserMedia && globalThis.MediaRecorder);
}

/** Explain a getUserMedia failure in plain words. */
export function explainMicError(e) {
  const n = e?.name || "";
  if (n === "NotAllowedError" || n === "SecurityError")
    return { message: "The microphone is blocked for this page.", hint: "Allow the microphone in the browser's site settings (on an iPhone: Settings, Safari, Microphone), then try again." };
  if (n === "NotFoundError" || n === "OverconstrainedError") return { message: "No microphone was found.", hint: "Plug in or switch on a microphone, then try again." };
  if (n === "NotReadableError") return { message: "Another app is using the microphone.", hint: "Close the other app (a call, a voice note), then try again." };
  return { message: "The microphone did not start.", hint: e?.message || "Reload the page and try again." };
}

/**
 * start() asks for the microphone and starts recording.
 * onLevel(0..1) about 30 times a second; onChunk(blob) every `sliceMs`.
 * stop() resolves { blob, mime, seconds }.
 */
export function createRecorder({ onLevel, onChunk, sliceMs = 5000 } = {}) {
  let stream = null;
  let rec = null;
  let ctx = null;
  let raf = 0;
  let chunks = [];
  let startedAt = 0;
  let pausedTotal = 0;
  let pausedAt = 0;
  const mime = pickMime();

  const meter = (analyser) => {
    const data = new Float32Array(analyser.fftSize);
    const tick = () => {
      analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / data.length);
      // speech sits around 0.02 to 0.2 RMS; map it onto 0..1 on a log scale
      const level = Math.max(0, Math.min(1, (Math.log10(rms + 1e-4) + 3) / 2.3));
      onLevel?.(rec?.state === "recording" ? level : 0);
      raf = requestAnimationFrame(tick);
    };
    tick();
  };

  async function start() {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunks = [];
    rec.ondataavailable = (e) => {
      if (e.data?.size) {
        chunks.push(e.data);
        onChunk?.(e.data);
      }
    };
    rec.start(sliceMs);
    startedAt = performance.now();
    pausedTotal = 0;
    try {
      const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
      ctx = new Ctx();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(analyser);
      meter(analyser);
    } catch {
      // no meter on this browser; recording still works
    }
  }

  function seconds() {
    if (!startedAt) return 0;
    const now = rec?.state === "paused" ? pausedAt : performance.now();
    return Math.max(0, (now - startedAt - pausedTotal) / 1000);
  }

  function pause() {
    if (rec?.state !== "recording") return;
    rec.pause();
    pausedAt = performance.now();
  }

  function resume() {
    if (rec?.state !== "paused") return;
    pausedTotal += performance.now() - pausedAt;
    rec.resume();
  }

  function cleanup() {
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach((t) => t.stop());
    ctx?.close?.().catch(() => {});
    stream = null;
    ctx = null;
  }

  function stop() {
    const secs = seconds();
    return new Promise((resolve) => {
      if (!rec || rec.state === "inactive") {
        cleanup();
        return resolve({ blob: new Blob(chunks, { type: mime || "audio/webm" }), mime: mime || "audio/webm", seconds: secs });
      }
      rec.onstop = () => {
        cleanup();
        const type = rec.mimeType || mime || "audio/webm";
        resolve({ blob: new Blob(chunks, { type }), mime: type, seconds: secs });
      };
      rec.stop();
    });
  }

  return { start, pause, resume, stop, seconds, get state() { return rec?.state || "inactive"; }, mime };
}
