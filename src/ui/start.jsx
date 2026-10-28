// Home, a new session, and the consent moment.
import { useEffect, useRef, useState } from "preact/hooks";
import { Lamp } from "./Lamp.jsx";
import { Bar, ErrorNote, Why, go, toast } from "./common.jsx";
import { LANGUAGES, LEVEL_LABEL, planFor } from "../lib/languages.js";
import { listSessions, newId, newSession, putBlob, saveSession, getSession } from "../store/db.js";
import { canRecord, createRecorder, explainMicError } from "../engine/recorder.js";
import { clock } from "../lib/text.js";
import { fmtDate } from "../state.js";
import { openArchive } from "../lib/archive.js";

export function Home() {
  const [count, setCount] = useState(0);
  const [err, setErr] = useState(null);
  useEffect(() => {
    listSessions()
      .then((s) => setCount(s.length))
      .catch(() => {});
  }, []);
  const fileRef = useRef(null);
  const onOpen = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const { session, blobs } = await openArchive(f, newId);
      for (const [id, b] of blobs) await putBlob(id, b);
      await saveSession(session);
      toast("Archive opened");
      go(`/s/${session.id}`);
    } catch (x) {
      setErr({ message: "That archive did not open.", hint: x.message });
    }
  };
  return (
    <main class="screen home">
      <Lamp state="idle" playful />
      <h1>Tell me again.</h1>
      <p class="lead">Record an elder's stories. This phone writes them down and helps you make a small family book. Nothing leaves the phone.</p>
      <div class="actions">
        <button class="btn primary wide" onClick={() => go("/new")}>
          Start a session
        </button>
        {count ? (
          <button class="btn wide" onClick={() => go("/archive")}>
            Your family's stories ({count})
          </button>
        ) : null}
      </div>
      <ErrorNote error={err} />
      <div class="row-links">
        <Why label="Why private?">
          <p>The stories are recorded, written down and kept in this browser. There is no account and no server copy.</p>
          <p>The models download once from Hugging Face and then run on this device. Only if you choose Google for the story book does text leave the phone, and the page asks first, every session.</p>
          <p>
            <a href="#/about">How it works</a>
          </p>
        </Why>
        <button class="link" onClick={() => fileRef.current?.click()}>
          Open an archive
        </button>
        <input ref={fileRef} type="file" accept=".zip,application/zip" class="visually-hidden" onChange={onOpen} tabIndex={-1} />
      </div>
    </main>
  );
}

export function NewSession() {
  const [name, setName] = useState("");
  const [lang, setLang] = useState("en");
  const plan = planFor(lang);
  const l = LANGUAGES.find((x) => x.id === lang);
  const start = async () => {
    const s = newSession({ elder: { name: name.trim() }, lang });
    await saveSession(s);
    go(`/s/${s.id}/consent`);
  };
  return (
    <main class="screen">
      <Bar />
      <h2>Who is telling the stories?</h2>
      <label class="field">
        Their name, as the family says it
        <input type="text" value={name} onInput={(e) => setName(e.target.value)} placeholder="Grandma, Baba, Aunty Ngozi" autocomplete="off" autocapitalize="words" enterkeyhint="next" />
      </label>
      <div class="stack">
        <strong>What will they speak?</strong>
        <div class="chips" role="group" aria-label="Language">
          {[...LANGUAGES, { id: "mix", native: "A mix" }].map((x) => (
            <button key={x.id} class="chip" aria-pressed={lang === x.id} onClick={() => setLang(x.id)}>
              {x.native}
            </button>
          ))}
        </div>
        <div class="honest">
          <span class="tag">{plan.label}</span>
          <span class="soft">{plan.note}</span>
          {l?.why ? (
            <Why>
              <p>{l.why}</p>
              <p>Every recording is kept either way. The audio is the true record; the writing is a help.</p>
            </Why>
          ) : null}
        </div>
      </div>
      <div class="spacer" />
      <button class="btn primary wide" onClick={start}>
        Next: ask if it's all right
      </button>
    </main>
  );
}

/** Record a short clip with the lamp; resolves via onDone({ blob, mime, seconds }). */
export function useRecorder({ onChunk } = {}) {
  const level = useRef(null);
  const rec = useRef(null);
  const [state, setState] = useState("idle"); // idle | recording | paused | saving
  const [secs, setSecs] = useState(0);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (state !== "recording" && state !== "paused") return;
    const t = setInterval(() => setSecs(rec.current?.seconds() || 0), 250);
    return () => clearInterval(t);
  }, [state]);
  useEffect(() => () => rec.current?.stop(), []);
  const start = async () => {
    setErr(null);
    if (!canRecord()) {
      setErr({ message: "This browser cannot record audio.", hint: "Use Safari on an iPhone, or Chrome on Android or a computer." });
      return false;
    }
    const r = createRecorder({ onLevel: (v) => level.current?.(v), onChunk });
    try {
      await r.start();
    } catch (e) {
      setErr(explainMicError(e));
      return false;
    }
    rec.current = r;
    setSecs(0);
    setState("recording");
    return true;
  };
  const pause = () => {
    rec.current?.pause();
    setState("paused");
  };
  const resume = () => {
    rec.current?.resume();
    setState("recording");
  };
  const stop = async () => {
    setState("saving");
    const out = await rec.current.stop();
    rec.current = null;
    setState("idle");
    return out;
  };
  return { level, state, secs, err, start, pause, resume, stop };
}

export function Consent({ id }) {
  const [s, setS] = useState(null);
  const [mode, setMode] = useState("record"); // record | note
  const [note, setNote] = useState("");
  const r = useRecorder();
  useEffect(() => {
    getSession(id).then(setS);
  }, [id]);
  if (!s) return null;
  const who = s.elder.name || "[your name]";
  const words = `I am ${who}. Today is ${fmtDate(new Date().toISOString())}. I am happy for my family to record my stories and keep them.`;
  const done = async () => {
    const out = await r.stop();
    const blobId = newId("b");
    await putBlob(blobId, out.blob);
    s.consent = { kind: "recorded", blobId, mime: out.mime, seconds: out.seconds, at: new Date().toISOString(), words };
    await saveSession(s);
    setS({ ...s });
    toast("Consent saved with this session");
  };
  const saveNote = async () => {
    s.consent = { kind: "note", text: note.trim(), at: new Date().toISOString() };
    await saveSession(s);
    go(`/s/${s.id}`);
  };
  if (s.consent) {
    return (
      <main class="screen">
        <Bar to={`/s/${s.id}`} title={s.elder.name} />
        <Lamp state="idle" />
        <h2>Thank you. Now, a story.</h2>
        <p class="soft">The consent is saved with this session{s.consent.kind === "recorded" ? ` (${clock(s.consent.seconds)})` : ""}. You can pause any time, and start a new story when they change topic.</p>
        <div class="spacer" />
        <button class="btn primary wide" onClick={() => go(`/s/${s.id}/record`)}>
          Start the first story
        </button>
        <button class="btn quiet" onClick={() => go(`/s/${s.id}`)}>
          Add a recording you already have
        </button>
      </main>
    );
  }
  return (
    <main class="screen">
      <Bar to={`/s/${s.id}`} title={s.elder.name} />
      {mode === "record" ? (
        <>
          <h2>First, ask if it's all right.</h2>
          <p class="soft">Record them saying yes, in their own words and any language. It stays with the stories.</p>
          {r.state === "idle" ? <p class="say">{words}</p> : <Lamp big state="on" level={r.level} label="Recording the consent" />}
          {r.state !== "idle" ? <p class="timer" style={{ textAlign: "center" }}>{clock(r.secs)}</p> : null}
          <ErrorNote error={r.err} />
          <div class="spacer" />
          {r.state === "idle" ? (
            <button class="btn primary wide" onClick={r.start}>
              Record their yes
            </button>
          ) : (
            <button class="btn primary wide" onClick={done} disabled={r.state === "saving" || r.secs < 1}>
              Done
            </button>
          )}
          {r.state === "idle" ? (
            <button class="btn quiet" onClick={() => setMode("note")}>
              Keeping recordings of someone who has passed on?
            </button>
          ) : null}
        </>
      ) : (
        <>
          <h2>Who agreed to keep these?</h2>
          <p class="soft">For recordings of someone who can no longer say yes, write who in the family agreed to keep them, and how.</p>
          <textarea value={note} onInput={(e) => setNote(e.target.value)} placeholder="Example: Her children agreed at the family meeting on 12 October." />
          <div class="spacer" />
          <button class="btn primary wide" onClick={saveNote} disabled={note.trim().length < 10}>
            Save this note
          </button>
          <button class="btn quiet" onClick={() => setMode("record")}>
            Record a yes instead
          </button>
        </>
      )}
    </main>
  );
}

export { LEVEL_LABEL };
