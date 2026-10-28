// One session: its stories, writing them down, the story book and the archive.
import { useEffect, useRef, useState } from "preact/hooks";
import { Bar, ErrorNote, Progress, Why, bytesDetail, go, saveFile, toast, useWakeLock } from "./common.jsx";
import { deleteSession, getBlob, getSession, newId, putBlob, saveSession } from "../store/db.js";
import { LANGUAGES, planFor } from "../lib/languages.js";
import { clock } from "../lib/text.js";
import { fixNameEverywhere } from "../lib/names.js";
import { fmtDate, nairaFor, runtimes } from "../state.js";
import { onWriter, stopWriting, toWrite, writeDown, writerState } from "./writer.js";
import { buildArchive, archiveName } from "../lib/archive.js";
import { storyText } from "../lib/bookhtml.js";
import { downloadAdvice } from "../engine/devices.js";
import { getTranscriber } from "../state.js";
import { decodeToMono } from "../engine/audio.js";

export function useWriter() {
  const [w, setW] = useState(writerState());
  useEffect(() => onWriter(setW), []);
  return w;
}

export function useSession(id, deps = []) {
  const [s, setS] = useState(null);
  const reload = () => getSession(id).then((x) => setS(x || false));
  useEffect(() => {
    reload();
  }, [id, ...deps]);
  return [s, reload, setS];
}

const langName = (id) => (id === "mix" ? "A mix" : LANGUAGES.find((l) => l.id === id)?.native || id);

function storyStatus(st) {
  if (st.transcript?.lines?.length || st.typed?.trim()) return { cls: "done", text: "Written" };
  if (!planFor(st.lang).transcribe) return { cls: "todo", text: "Type it" };
  if (!st.seconds) return { cls: "", text: "Empty" };
  return { cls: "todo", text: "To write down" };
}

/** The download question, asked before the first speech model download. */
export function WriteDownPanel({ session, onlyStoryId = null }) {
  const w = useWriter();
  const t = getTranscriber();
  const [asked, setAsked] = useState(false);
  const [cached, setCached] = useState(null);
  useWakeLock(w.phase === "download" || w.phase === "writing");
  useEffect(() => {
    // the speech model is stored after the first download; ask about data only before that
    caches
      .open("tell-me-again-models")
      .then((c) => c.keys())
      .then((k) => setCached(k.some((r) => r.url.includes(t.model.id))))
      .catch(() => setCached(false));
  }, [t.model.id]);
  const mine = w.sessionId === session.id;
  if (mine && w.phase === "download") return <Progress label={`Getting the ${t.model.short}`} p={w.total ? w.loaded / w.total : null} detail={`${bytesDetail(w)}. Once only.`} onStop={stopWriting} />;
  if (mine && w.phase === "writing") {
    return (
      <Progress
        label={w.of > 1 ? `${w.label} (${w.k + 1} of ${w.of})` : w.label}
        p={w.total ? Math.min(1, w.done / w.total) : null}
        detail={w.total ? `${clock(w.done)} of ${clock(w.total)}` : ""}
        onStop={stopWriting}
      />
    );
  }
  const pending = toWrite(session).filter((s) => !onlyStoryId || s.id === onlyStoryId);
  if (!pending.length) return mine && w.phase === "error" ? <ErrorNote error={w.error} onRetry={() => writeDown(session.id, onlyStoryId)} /> : null;
  const advice = downloadAdvice(t.bytes);
  const start = () => writeDown(session.id, onlyStoryId);
  return (
    <div class="stack">
      {mine && w.phase === "error" ? <ErrorNote error={w.error} /> : null}
      {cached === false && !asked ? (
        <div class="notice">
          <strong>Writing it down needs the {t.model.short}.</strong>
          <span class="soft">
            {Math.round(t.bytes / 1e6)} MB, once, about {nairaFor(t.bytes)} of data. {advice.metered ? "You seem to be on mobile data. Wi-Fi is cheaper." : ""}
          </span>
          <Why>
            <p>It comes from Hugging Face and is kept in this browser, so the next time needs no data. It runs on this device: the audio is never uploaded.</p>
            <p>The data cost assumes ₦500 a GB (MTN's 7 GB monthly plan is ₦3,500, mtn.ng, August 2026).</p>
          </Why>
          <button
            class="btn primary wide"
            onClick={() => {
              setAsked(true);
              start();
            }}
          >
            Download and write it down
          </button>
        </div>
      ) : (
        <button class="btn primary wide" onClick={start}>
          {pending.length > 1 ? `Write down ${pending.length} stories` : "Write it down"}
        </button>
      )}
    </div>
  );
}

export function Session({ id }) {
  const w = useWriter();
  const [s, reload] = useSession(id, [w.phase]);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState(null);
  const fileRef = useRef(null);
  if (s === false) return <Missing />;
  if (!s) return null;
  const hasText = s.stories.some((st) => storyText(st));
  const save = async () => {
    setBusy("Packing the archive");
    try {
      const zip = await buildArchive(s, getBlob);
      saveFile(zip, archiveName(s));
      toast("Archive saved");
    } catch (e) {
      setErr({ message: "The archive could not be made.", hint: e.message });
    }
    setBusy("");
  };
  const addFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy("Adding the recording");
    try {
      let keep = { blob: f, mime: f.type || "audio/mp4", seconds: 0 };
      const { isVideoLike, extractAudio } = await import("../engine/extract.js");
      if (isVideoLike(f)) {
        // keep only the sound: a phone video is mostly picture
        setBusy("Taking the sound from the video");
        keep = await extractAudio(f, { onProgress: (p) => setBusy(`Taking the sound from the video (${Math.round(p * 100)}%)`) });
      } else {
        // read its length, and check this browser can play it, before keeping it
        keep.seconds = (await decodeToMono(f)).length / 16000;
      }
      const story = { id: newId("t"), blobId: newId("b"), mime: keep.mime, seconds: keep.seconds, lang: s.lang, at: new Date().toISOString(), title: f.name.replace(/\.[^.]+$/, "").slice(0, 60), transcript: null, typed: "", imported: true };
      await putBlob(story.blobId, keep.blob);
      s.stories.push(story);
      await saveSession(s);
      reload();
      toast("Recording added");
    } catch (x) {
      setErr({ message: "That file could not be added.", hint: x.hint || x.message });
    }
    setBusy("");
  };
  const remove = async () => {
    if (!confirm(`Delete ${s.elder.name ? `${s.elder.name}'s` : "this"} session and all its recordings from this device? Save the archive first if you want a copy.`)) return;
    await deleteSession(s.id);
    go("/");
  };
  return (
    <main class="screen">
      <Bar to="/" title={fmtDate(s.createdAt)} />
      <h2>{s.elder.name ? `${s.elder.name}'s stories` : "The stories"}</h2>
      {!s.consent ? (
        <button class="btn primary wide" onClick={() => go(`/s/${s.id}/consent`)}>
          First, ask if it's all right
        </button>
      ) : null}
      {s.stories.length ? (
        <div class="list">
          {s.stories.map((st, i) => {
            const status = storyStatus(st);
            return (
              <button class="item" key={st.id} onClick={() => go(`/s/${s.id}/t/${st.id}`)}>
                <span class="grow">
                  <span class="name">{st.title || `Story ${i + 1}`}</span>
                  <br />
                  <span class="meta">
                    {clock(st.seconds)}, {langName(st.lang)}
                  </span>
                </span>
                <span class={`status ${status.cls}`}>{status.text}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <p class="soft">No stories yet.</p>
      )}
      {s.consent ? <WriteDownPanel session={s} /> : null}
      {busy ? <Progress label={busy} /> : null}
      <ErrorNote error={err} />
      <div class="stack">
        {s.consent ? (
          <button class="btn wide" onClick={() => go(`/s/${s.id}/record`)}>
            Record {s.stories.length ? "another story" : "a story"}
          </button>
        ) : null}
        {hasText ? (
          <button class="btn wide" onClick={() => go(`/s/${s.id}/book`)}>
            {s.book ? "Open the story book" : "Make the story book"}
          </button>
        ) : null}
        {s.stories.length ? (
          <button class="btn wide" onClick={save} disabled={!!busy}>
            Save the family archive
          </button>
        ) : null}
      </div>
      <div class="row-links">
        {s.consent ? (
          <button class="link" onClick={() => fileRef.current?.click()}>
            Add a recording you already have
          </button>
        ) : null}
        <button class="link" onClick={remove}>
          Delete this session
        </button>
      </div>
      <input ref={fileRef} type="file" accept="audio/*,video/*" class="visually-hidden" onChange={addFile} tabIndex={-1} />
    </main>
  );
}

export function Story({ id, storyId }) {
  const w = useWriter();
  const [s, reload, setS] = useSession(id, [w.phase]);
  const [url, setUrl] = useState("");
  const audioRef = useRef(null);
  const st = s && s.stories.find((x) => x.id === storyId);
  useEffect(() => {
    if (!st?.blobId) return;
    let u = "";
    getBlob(st.blobId).then((b) => {
      if (!b) return;
      u = URL.createObjectURL(b);
      setUrl(u);
    });
    return () => u && URL.revokeObjectURL(u);
  }, [st?.blobId]);
  if (s === false || (s && !st)) return <Missing />;
  if (!s) return null;
  const i = s.stories.indexOf(st);
  const plan = planFor(st.lang);
  const update = async (patch) => {
    Object.assign(st, patch);
    await saveSession(s);
    setS({ ...s });
  };
  const editLine = (k, text) => {
    const lines = st.transcript.lines.slice();
    if (lines[k].text === text) return;
    lines[k] = { ...lines[k], text };
    update({ transcript: { ...st.transcript, lines, edited: true } });
  };
  const seek = (t) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = t;
    a.play().catch(() => {});
  };
  const live = w.phase === "writing" && w.storyId === st.id ? w.lines : null;
  const lines = live || st.transcript?.lines || [];
  return (
    <main class="screen">
      <Bar to={`/s/${s.id}`} title={s.elder.name ? `${s.elder.name}'s stories` : "The stories"} />
      <input type="text" aria-label="Story name" value={st.title} placeholder={`Story ${i + 1}: give it a name`} onChange={(e) => update({ title: e.target.value.trim() })} />
      {url ? <audio ref={audioRef} controls src={url} preload="metadata" /> : null}
      <div class="honest">
        <span class="tag">
          {langName(st.lang)}: {plan.label}
        </span>
        <span class="soft small">{plan.note}</span>
      </div>
      <WriteDownPanel session={s} onlyStoryId={st.id} />
      {lines.length ? (
        <div class="lines" aria-label="Transcript">
          {lines.map((l, k) => (
            <div class={`line ${live ? "new" : ""}`} key={`${k}-${l.s}`}>
              <button class="t" onClick={() => seek(l.s)} aria-label={`Play from ${clock(l.s)}`}>
                {clock(l.s)}
              </button>
              <span class="x" contentEditable={!live} spellcheck={false} onBlur={(e) => editLine(k, e.currentTarget.textContent.trim())}>
                {l.text}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {st.transcript && !live ? <p class="soft small">Tap a line to fix it. Tap a time to hear that part.</p> : null}
      {st.transcript && !live ? <FixName s={s} onDone={() => setS({ ...s })} /> : null}
      <label class="field">
        {plan.transcribe ? "Notes, or anything the model missed" : "What was said, or a summary in English"}
        <textarea value={st.typed} onChange={(e) => update({ typed: e.target.value })} placeholder={plan.transcribe ? "Optional" : "Type it as they said it, or in English. The story book is made from this."} />
      </label>
    </main>
  );
}

/** "Worry" should be "Warri": fix a misheard name in every story of the session at once. */
function FixName({ s, onDone }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const fix = async () => {
    const n = fixNameEverywhere(s, from, to);
    await saveSession(s);
    toast(n ? `Fixed ${n} ${n === 1 ? "time" : "times"}` : `"${from.trim()}" was not found`);
    if (n) {
      setFrom("");
      setTo("");
    }
    onDone();
  };
  return (
    <Why label="A name came out wrong?">
      <div class="stack">
        <p>Fix it once, and it is fixed in every story of this session.</p>
        <input type="text" value={from} onInput={(e) => setFrom(e.target.value)} placeholder="What it wrote, like Worry" aria-label="What it wrote" autocomplete="off" />
        <input type="text" value={to} onInput={(e) => setTo(e.target.value)} placeholder="What they said, like Warri" aria-label="What they said" autocomplete="off" autocapitalize="words" />
        <button class="btn wide" onClick={fix} disabled={!from.trim() || !to.trim()}>
          Fix it everywhere
        </button>
      </div>
    </Why>
  );
}

function Missing() {
  return (
    <main class="screen">
      <Bar />
      <h2>This session is not on this device.</h2>
      <p class="soft">Sessions live in the browser they were recorded in. Open its archive to bring it here.</p>
    </main>
  );
}

export { runtimes };
