// The archive list and "How it works".
import { useEffect, useState } from "preact/hooks";
import { Bar, go, toast } from "./common.jsx";
import { listSessions } from "../store/db.js";
import { fmtDate, runtimes } from "../state.js";
import { GEMMA, SPEECH, mb, speechBytes } from "../engine/models.js";
import { forgetGemma, gemmaIsCached } from "../engine/llm.js";
import { opfsStore } from "../engine/download.js";
import { storageEstimate } from "../engine/devices.js";
import { LANGUAGES, LEVEL_LABEL } from "../lib/languages.js";

export function Archive() {
  const [list, setList] = useState(null);
  useEffect(() => {
    listSessions().then(setList);
  }, []);
  if (!list) return null;
  return (
    <main class="screen">
      <Bar />
      <h2>Your family's stories</h2>
      {list.length ? (
        <div class="list">
          {list.map((s) => (
            <button class="item" key={s.id} onClick={() => go(`/s/${s.id}`)}>
              <span class="grow">
                <span class="name">{s.elder.name || "Unnamed storyteller"}</span>
                <br />
                <span class="meta">
                  {fmtDate(s.createdAt)}, {s.stories.length} {s.stories.length === 1 ? "story" : "stories"}
                </span>
              </span>
              {s.book ? <span class="status done">Book</span> : null}
            </button>
          ))}
        </div>
      ) : (
        <p class="soft">Nothing yet.</p>
      )}
      <p class="soft small">These live in this browser only. Save each session's archive to keep a copy.</p>
    </main>
  );
}

export function About() {
  const [est, setEst] = useState(null);
  const [have, setHave] = useState({});
  const refresh = async () => {
    setEst(await storageEstimate());
    const h = {};
    for (const k of Object.keys(GEMMA)) h[k] = await gemmaIsCached(k).catch(() => false);
    setHave(h);
  };
  useEffect(() => {
    refresh();
  }, []);
  const clearSpeech = async () => {
    const s = await opfsStore();
    for (const m of Object.values(SPEECH)) for (const f of Object.keys(m.files)) await s?.reset(`https://huggingface.co/${m.id}/resolve/main/${f}`);
    await caches.delete("tell-me-again-models").catch(() => {});
    toast("Speech models removed");
    refresh();
  };
  const clearGemma = async (k) => {
    await forgetGemma(k);
    toast(`${GEMMA[k].label} removed`);
    refresh();
  };
  return (
    <main class="screen">
      <Bar />
      <h2>How it works</h2>
      <p>The stories are recorded and kept in this browser. There is no account, and nothing is stored on a server.</p>
      <h3>Writing it down</h3>
      <p class="soft">
        Whisper, an open speech model, runs on this device. This {runtimes.phone ? "phone" : "computer"} uses {SPEECH[runtimes.speech].label} ({mb(speechBytes(SPEECH[runtimes.speech]))}).
      </p>
      <div class="list">
        {LANGUAGES.map((l) => (
          <div class="item" key={l.id}>
            <span class="grow">
              <span class="name">{l.native}</span>
              <br />
              <span class="meta">{l.why}</span>
            </span>
            <span class={`status ${l.level === "none" ? "todo" : ""}`}>{LEVEL_LABEL[l.level]}</span>
          </div>
        ))}
      </div>
      <h3>The story book</h3>
      <p class="soft">Gemma, Google's open model, reads the transcript on this device (Gemma 3 1B on a computer, 270M on a phone). If you choose, Gemma 4 on Google's free API does it instead, with text only and a warning first. Names, places, years and quotes Gemma writes are kept only if they appear in the transcript.</p>
      <h3>Space on this device</h3>
      <p class="soft">{est?.usage != null ? `This app uses ${mb(est.usage)}.` : ""}</p>
      <div class="stack">
        <button class="btn wide" onClick={clearSpeech}>
          Remove the speech models
        </button>
        {Object.entries(GEMMA).map(([k, m]) =>
          have[k] ? (
            <button class="btn wide" key={k} onClick={() => clearGemma(k)}>
              Remove {m.label} ({mb(m.size)})
            </button>
          ) : null,
        )}
      </div>
      <h3>Made with</h3>
      <p class="soft small">
        Whisper (MIT) via transformers.js; Gemma 3 (Gemma Terms of Use) via wllama and llama.cpp; Literata (SIL Open Font License). Models download from Hugging Face; the runtimes from jsDelivr. The resumable downloader comes from Selects. Code: MIT.
      </p>
    </main>
  );
}
