// Where to cut long audio for Whisper, which hears 30 s at a time.
// From Selects (github.com/IkpemosiArnold/selects, MIT), src/browser/asr.worker.js.

/** Cut points: windows of at most `maxSec`, each ending at the quietest 50 ms in its last `searchSec`. */
export function planWindows(pcm, rate, { maxSec = 29.5, searchSec = 5 } = {}) {
  const out = [];
  const frame = Math.round(rate * 0.05);
  let pos = 0;
  while (pos < pcm.length) {
    const hardEnd = Math.min(pcm.length, pos + Math.round(maxSec * rate));
    if (hardEnd >= pcm.length) {
      out.push([pos, pcm.length]);
      break;
    }
    let best = hardEnd;
    let bestE = Infinity;
    for (let i = Math.max(pos + frame, hardEnd - Math.round(searchSec * rate)); i + frame <= hardEnd; i += frame) {
      let e = 0;
      for (let k = i; k < i + frame; k++) e += pcm[k] * pcm[k];
      if (e < bestE) {
        bestE = e;
        best = i + Math.round(frame / 2);
      }
    }
    out.push([pos, best]);
    pos = best;
  }
  return out;
}
