// The story book: choose where Gemma runs, watch it work, read the book.
import { useEffect, useRef, useState } from "preact/hooks";
import { Bar, ErrorNote, Progress, Why, bytesDetail, go, saveFile, toast, useWakeLock } from "./common.jsx";
import { useSession } from "./session.jsx";
import { saveSession, getBlob } from "../store/db.js";
import { storyText } from "../lib/bookhtml.js";
import { makeBook } from "../lib/book.js";
import { makeOutline } from "../lib/outline.js";
import { buildArchive, archiveName } from "../lib/archive.js";
import { GEMMA, CLOUD_MODELS, mb } from "../engine/models.js";
import { gemmaIsCached, geminiBackend, wllamaBackend } from "../engine/llm.js";
import { downloadAdvice } from "../engine/devices.js";
import { cloud, nairaFor, runtimes, testHooks } from "../state.js";

const KEY_RE = /^[A-Za-z0-9_\-]{20,}$/;

export function Book({ id }) {
  const [s, , setS] = useSession(id);
  const [remake, setRemake] = useState(false);
  if (s === false) return null;
  if (!s) return null;
  if (s.book && !remake) return <BookView s={s} onRemake={() => setRemake(true)} />;
  return (
    <Maker
      s={s}
      onDone={async (book) => {
        s.book = book;
        await saveSession(s);
        setS({ ...s });
        setRemake(false);
      }}
    />
  );
}

function Maker({ s, onDone }) {
  const local = runtimes.defaultGemma;
  const [where, setWhere] = useState(cloud.allowed.has(s.id) ? "google" : "device");
  const [key, setKey] = useState(cloud.key);
  const [hide, setHide] = useState(true);
  const [agree, setAgree] = useState(cloud.allowed.has(s.id));
  const [cached, setCached] = useState(null);
  const [job, setJob] = useState(null); // { label, p, detail }
  const [err, setErr] = useState(null);
  const ctl = useRef(null);
  const backendRef = useRef(null);
  useWakeLock(!!job);
  useEffect(() => {
    gemmaIsCached(local)
      .then(setCached)
      .catch(() => setCached(false));
    return () => {
      ctl.current?.abort();
      backendRef.current?.unload?.();
    };
  }, []);
  const m = GEMMA[local];
  const stories = s.stories.map((st, i) => ({ title: st.title || `Story ${i + 1}`, text: storyText(st) })).filter((x) => x.text);
  const text = stories.map((x) => x.text).join("\n\n");
  const words = text.split(/\s+/).filter(Boolean).length;
  const advice = downloadAdvice(m.size);

  const run = async () => {
    setErr(null);
    ctl.current = new AbortController();
    const signal = ctl.current.signal;
    try {
      if (where === "outline") {
        await onDone(makeOutline({ stories, elder: s.elder }));
        return;
      }
      let backend;
      if (testHooks?.backend) backend = testHooks.backend;
      else if (where === "google") {
        cloud.key = key.trim();
        cloud.allowed.add(s.id);
        backend = geminiBackend({ key: cloud.key, model: CLOUD_MODELS[0], hide, elderName: s.elder.name });
      } else backend = wllamaBackend(local);
      backendRef.current = backend;
      if (backend.where === "device" && !backend.loaded) {
        setJob({ label: `Getting ${m.label}`, p: 0, detail: "" });
        await backend.load({ signal, onProgress: (p) => setJob({ label: `Getting ${m.label}`, p: p.total ? p.loaded / p.total : null, detail: `${bytesDetail(p)}. Once only.` }) });
        setJob({ label: "Waking Gemma up", p: null, detail: "Loading it into memory" });
      }
      const t0 = performance.now();
      const book = await makeBook({
        text,
        elder: s.elder,
        backend,
        passageWords: backend.passageWords || 450,
        signal,
        onStep: ({ step, of, label }) => {
          const secs = (performance.now() - t0) / 1000;
          const each = step > 1 ? secs / (step - 1) : null;
          setJob({ label, p: (step - 1) / of, detail: each ? `About ${Math.max(1, Math.round((each * (of - step + 1)) / 60))} min left` : "Gemma is reading" });
        },
      });
      book.made.seconds = Math.round((performance.now() - t0) / 1000);
      if (backend.where === "google") book.made.namesHidden = hide;
      await onDone(book);
      toast("The story book is ready");
    } catch (e) {
      if (e?.name === "AbortError" || signal.aborted) {
        setJob(null);
        return;
      }
      setErr({ message: e.message || "Gemma stopped.", hint: e.hint || (where === "device" ? "Close other tabs and apps, then try again, or try with Google." : "Try again in a minute.") });
    }
    setJob(null);
  };
  const stop = () => {
    ctl.current?.abort();
    backendRef.current?.unload?.();
    backendRef.current = null;
    setJob(null);
  };
  const canGo = where !== "google" || (agree && KEY_RE.test(key.trim()));

  return (
    <main class="screen">
      <Bar to={`/s/${s.id}`} title={s.elder.name ? `${s.elder.name}'s stories` : "The stories"} />
      <h2>Make the story book</h2>
      <p class="soft">Gemma, an open model, reads the {words.toLocaleString("en-GB")} words written down and makes chapters, the people and places, a timeline, and questions for next time.</p>
      {job ? (
        <Progress label={job.label} p={job.p} detail={job.detail} onStop={stop} />
      ) : (
        <>
          <div class="stack" role="radiogroup" aria-label="Where Gemma runs">
            <button class="choice" role="radio" aria-pressed={where === "device"} aria-checked={where === "device"} onClick={() => setWhere("device")}>
              <span class="head">
                <span>On this device</span>
                <span class="size">{cached ? "ready" : `${mb(m.size)} once`}</span>
              </span>
              <span class="soft small">
                Private. {m.label}. {runtimes.phone ? "Small, so the book is rougher." : "A few minutes on a laptop."}
              </span>
            </button>
            <button class="choice" role="radio" aria-pressed={where === "google"} aria-checked={where === "google"} onClick={() => setWhere("google")}>
              <span class="head">
                <span>With Google</span>
                <span class="size">your free key</span>
              </span>
              <span class="soft small">Gemma 4, much bigger and better. Sends the text only, never audio.</span>
            </button>
            <button class="choice" role="radio" aria-pressed={where === "outline"} aria-checked={where === "outline"} onClick={() => setWhere("outline")}>
              <span class="head">
                <span>Outline, no AI</span>
                <span class="size">instant</span>
              </span>
              <span class="soft small">Names and years found by simple rules. No retelling.</span>
            </button>
          </div>
          {where === "device" && !cached ? (
            <p class="soft small">
              {mb(m.size)} is about {nairaFor(m.size)} of data. {advice.metered ? "You seem to be on mobile data; Wi-Fi is cheaper." : "It is kept for next time."}
            </p>
          ) : null}
          {where === "google" ? (
            <div class="notice warn">
              <strong>Google's free tier may keep this text, and people at Google may read it to improve their products.</strong>
              <Why label="What exactly is sent?">
                <p>The written-down text, a part at a time, with instructions. Never the audio, never the consent.</p>
                <p>Google's terms for the free tier say: "Do not submit sensitive, confidential, or personal information." Swapping names for stand-ins (N1, N2) helps, but a story can still say who it is about.</p>
                <p>Get a free key at aistudio.google.com/apikey. No card is needed. The key stays in this tab and is forgotten when you close it.</p>
              </Why>
              <input type="password" value={key} onInput={(e) => setKey(e.target.value)} placeholder="Paste your Gemini API key" autocomplete="off" spellcheck={false} aria-label="Gemini API key" />
              <label class="check">
                <input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} />
                <span>Swap names for stand-ins before sending</span>
              </label>
              <label class="check">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                <span>Send this session's text to Google, this time only</span>
              </label>
            </div>
          ) : null}
          <ErrorNote error={err} />
          <div class="spacer" />
          <button class="btn primary wide" onClick={run} disabled={!canGo || !words}>
            {where === "outline" ? "Make the outline" : where === "device" && !cached ? `Download and make the book` : "Make the book"}
          </button>
        </>
      )}
    </main>
  );
}

function BookView({ s, onRemake }) {
  const b = s.book;
  const save = async () => {
    const zip = await buildArchive(s, getBlob);
    saveFile(zip, archiveName(s));
    toast("Archive saved");
  };
  const made = b.made || {};
  let i = 0;
  const step = () => ({ "--i": i++ });
  return (
    <main class="screen book">
      <Bar to={`/s/${s.id}`} title={s.elder.name ? `${s.elder.name}'s stories` : "The stories"} />
      <article class="page">
        <h1 style={step()}>{b.title}</h1>
        {b.chapters.map((c) => (
          <section class="chapter" key={c.n} style={step()}>
            <h2>
              <span class="n">{c.n}</span>
              {c.title}
            </h2>
            {c.retelling ? <p>{c.retelling}</p> : c.firstLine ? <p class="soft">{c.firstLine}</p> : null}
            {c.quote ? <blockquote>{c.quote}</blockquote> : null}
          </section>
        ))}
        <section style={step()}>
          <h2>People</h2>
          {b.people.length ? (
            <ul>
              {b.people.map((p) => (
                <li key={p.name}>
                  <strong>{p.name}</strong>
                  {p.note ? `, ${p.note}` : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p class="soft">None found in the recording.</p>
          )}
        </section>
        {b.places.length ? (
          <section style={step()}>
            <h2>Places</h2>
            <ul>
              {b.places.map((p) => (
                <li key={p.name}>
                  <strong>{p.name}</strong>
                  {p.note ? `, ${p.note}` : ""}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {b.timeline.length ? (
          <section style={step()}>
            <h2>Timeline</h2>
            <ul>
              {b.timeline.map((m, k) => (
                <li key={k}>
                  <strong>{m.when || "Undated"}</strong>: {m.what}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {b.questions?.length ? (
          <section style={step()}>
            <h2>Ask next time</h2>
            <ul>
              {b.questions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </section>
        ) : null}
        <p class="made" style={step()}>
          {b.kind === "outline"
            ? "Made by simple rules on this device, without AI."
            : `Retold by ${made.by}${made.where === "google" ? " through Google" : " on this device"}${made.seconds ? ` in ${Math.max(1, Math.round(made.seconds / 60))} min` : ""}. Names, places, years and quotes were checked against the transcript.`}
        </p>
        {b.checks?.length ? (
          <Why label={`Left out: ${b.checks.length} thing${b.checks.length === 1 ? "" : "s"} Gemma said that the recording does not`}>
            <ul>
              {b.checks.map((c, k) => (
                <li key={k}>
                  {c.value} <span class="soft">({c.why})</span>
                </li>
              ))}
            </ul>
          </Why>
        ) : null}
      </article>
      <div class="stack" style={{ marginTop: 18 }}>
        <button class="btn primary wide" onClick={save}>
          Save the family archive
        </button>
        <button class="btn wide" onClick={onRemake}>
          Make it again
        </button>
        <button class="btn quiet" onClick={() => go(`/s/${s.id}/record`)}>
          Record more stories
        </button>
      </div>
    </main>
  );
}
