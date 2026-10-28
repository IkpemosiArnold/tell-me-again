// Writing the stories down: one job at a time, kept outside the screens so it carries on
// while the family moves between them. Screens subscribe to its state.
import { decodeToMono, RATE } from "../engine/audio.js";
import { explainModelError } from "../engine/load-errors.js";
import { getBlob, getSession, saveSession } from "../store/db.js";
import { planFor } from "../lib/languages.js";
import { getTranscriber, stopTranscriber } from "../state.js";

const listeners = new Set();
let state = { phase: "idle" }; // idle | download | writing | done | error

function set(next) {
  state = { ...next };
  listeners.forEach((f) => f(state));
}
export const writerState = () => state;
export function onWriter(f) {
  listeners.add(f);
  return () => listeners.delete(f);
}

let stopped = false;
export function stopWriting() {
  stopped = true;
  stopTranscriber();
  set({ phase: "idle", note: "Stopped. What was written is kept." });
}

/** Stories in this session that the device can write down and has not yet. */
export function toWrite(session) {
  return session.stories.filter((s) => s.blobId && planFor(s.lang).transcribe && !s.transcript?.lines?.length && s.seconds > 0);
}

export async function writeDown(sessionId, onlyStoryId = null) {
  if (state.phase === "download" || state.phase === "writing") return;
  stopped = false;
  const t = getTranscriber();
  try {
    set({ phase: "download", sessionId, loaded: 0, total: t.bytes });
    await t.load({ onProgress: (p) => !stopped && set({ phase: "download", sessionId, ...p }) });
    let session = await getSession(sessionId);
    const list = toWrite(session).filter((s) => !onlyStoryId || s.id === onlyStoryId);
    for (const [k, story] of list.entries()) {
      if (stopped) return;
      const label = `Writing down story ${session.stories.findIndex((x) => x.id === story.id) + 1}`;
      set({ phase: "writing", sessionId, storyId: story.id, label, done: 0, total: story.seconds || 0, k, of: list.length, lines: [] });
      const blob = await getBlob(story.blobId);
      const pcm = await decodeToMono(blob, RATE);
      const lines = [];
      const res = await t.transcribe(pcm, RATE, {
        onLines: (got, p) => {
          lines.push(...got);
          if (!stopped) set({ phase: "writing", sessionId, storyId: story.id, label, done: p.done, total: p.total, k, of: list.length, lines: [...lines] });
        },
      });
      // read again: the family may have typed a title meanwhile
      session = await getSession(sessionId);
      const i = session.stories.findIndex((x) => x.id === story.id);
      if (i < 0) continue;
      session.stories[i].transcript = { by: `${t.model.label}, on this device`, model: t.model.id, at: new Date().toISOString(), lines: res.lines, edited: false, wallSec: res.wallSec };
      await saveSession(session);
    }
    set({ phase: "done", sessionId, note: list.length ? "Written down. Read it over against the audio." : "Nothing new to write down." });
  } catch (e) {
    if (stopped || e?.name === "AbortError") return;
    const ex = e?.hint ? { message: e.message, hint: e.hint } : explainModelError(e, { what: "speech model", sizeBytes: t.bytes });
    set({ phase: "error", sessionId, error: ex });
  }
}
