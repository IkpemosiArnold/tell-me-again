// Recording the stories. The lamp follows the voice; "Next story" closes one story and
// opens the next without stopping; what is recorded is saved every few seconds, so a
// closed tab or a dead battery loses at most the last few seconds.
import { useEffect, useRef, useState } from "preact/hooks";
import { Lamp } from "./Lamp.jsx";
import { Bar, ErrorNote, go, toast, useWakeLock } from "./common.jsx";
import { useRecorder } from "./start.jsx";
import { getSession, newId, putBlob, saveSession } from "../store/db.js";
import { clock } from "../lib/text.js";
import { QUESTIONS } from "../state.js";

export function Record({ id }) {
  const [s, setS] = useState(null);
  const [q, setQ] = useState(-1);
  const current = useRef(null); // { story, chunks, lastSave }
  const saveDraft = async (force = false) => {
    const c = current.current;
    if (!c || !c.chunks.length) return;
    const now = Date.now();
    if (!force && now - c.lastSave < 8000) return;
    c.lastSave = now;
    await putBlob(c.story.blobId, new Blob(c.chunks, { type: c.story.mime || "audio/webm" }));
  };
  const r = useRecorder({
    onChunk: (blob) => {
      current.current?.chunks.push(blob);
      saveDraft();
    },
  });
  useWakeLock(r.state === "recording");
  useEffect(() => {
    getSession(id).then(setS);
  }, [id]);
  if (!s) return null;

  const begin = async () => {
    const story = { id: newId("t"), blobId: newId("b"), mime: "", seconds: 0, lang: s.lang, at: new Date().toISOString(), title: "", transcript: null, typed: "" };
    current.current = { story, chunks: [], lastSave: Date.now() };
    const ok = await r.start();
    if (!ok) {
      current.current = null;
      return;
    }
    s.stories.push(story);
    await saveSession(s);
    setS({ ...s });
  };
  const close = async () => {
    const out = await r.stop();
    const c = current.current;
    current.current = null;
    if (!c) return;
    c.story.mime = out.mime;
    c.story.seconds = out.seconds;
    await putBlob(c.story.blobId, out.blob);
    const i = s.stories.findIndex((x) => x.id === c.story.id);
    if (i >= 0) s.stories[i] = c.story;
    await saveSession(s);
  };
  const next = async () => {
    await close();
    toast(`Story ${s.stories.length} saved`);
    await begin();
  };
  const finish = async () => {
    await close();
    go(`/s/${s.id}`);
  };
  const n = s.stories.length;
  const recording = r.state === "recording" || r.state === "paused" || r.state === "saving";
  return (
    <main class="screen rec">
      <Bar to={`/s/${s.id}`} title={s.elder.name ? `${s.elder.name}'s stories` : "The stories"} />
      <Lamp big state={recording ? (r.state === "paused" ? "off" : "on") : "idle"} level={r.level} label={recording ? `Recording story ${n}` : ""} />
      {recording ? (
        <>
          <p class="timer" aria-live="off">
            {clock(r.secs)}
          </p>
          <p class="soft">{r.state === "paused" ? "Paused" : `Story ${n}`}</p>
        </>
      ) : (
        <p class="soft">{n ? `${n} ${n === 1 ? "story" : "stories"} so far.` : "Put the phone between you, screen up."}</p>
      )}
      <ErrorNote error={r.err} />
      <button class="prompt-card" onClick={() => setQ((x) => (x + 1) % QUESTIONS.length)} aria-live="polite">
        {q < 0 ? <span class="soft">Need a question to ask? Tap here.</span> : <span class="q">{QUESTIONS[q]}</span>}
      </button>
      <div class="spacer" />
      {recording ? (
        <div class="rec-controls">
          {r.state === "paused" ? (
            <button class="btn" onClick={r.resume}>
              Resume
            </button>
          ) : (
            <button class="btn" onClick={r.pause} disabled={r.state === "saving"}>
              Pause
            </button>
          )}
          <button class="btn" onClick={next} disabled={r.state === "saving"}>
            Next story
          </button>
          <button class="btn primary" onClick={finish} disabled={r.state === "saving"}>
            Finish
          </button>
        </div>
      ) : (
        <button class="btn primary wide" onClick={begin}>
          {n ? "Record another story" : "Start recording"}
        </button>
      )}
    </main>
  );
}
