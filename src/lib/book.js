// The story book: what Gemma is asked, and how its answers are checked before a family sees
// them. Small models invent things. A 1B model asked about a grandmother's childhood will
// happily add a brother she never mentioned, so nothing Gemma writes about people, places,
// dates or quotes is kept unless it can be found in the transcript itself.
//
// The work is split so a small model on a phone or laptop can do it:
//   1. passage step, once per passage of about 450 words: a chapter (title, retelling, one
//      quote) and the people, places and moments mentioned in that passage
//   2. book step, once: a title for the whole book and questions to ask next time
// A large model (Gemma 4 on the Gemini API, opt-in) gets bigger passages, same steps.

import { COMMON, appearsIn, fold, passages, sentences, wordCount } from "./text.js";

export const PASSAGE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    retelling: { type: "string" },
    quote: { type: "string" },
    people: {
      type: "array",
      maxItems: 6,
      items: { type: "object", properties: { name: { type: "string" }, who: { type: "string" } }, required: ["name", "who"] },
    },
    places: {
      type: "array",
      maxItems: 6,
      items: { type: "object", properties: { name: { type: "string" }, note: { type: "string" } }, required: ["name", "note"] },
    },
    moments: {
      type: "array",
      maxItems: 5,
      items: { type: "object", properties: { when: { type: "string" }, what: { type: "string" } }, required: ["when", "what"] },
    },
  },
  required: ["title", "retelling", "quote", "people", "places", "moments"],
};

export const BOOK_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    questions: { type: "array", minItems: 3, maxItems: 6, items: { type: "string" } },
  },
  required: ["title", "questions"],
};

const SYSTEM = [
  "You help a Nigerian family keep an elder's stories.",
  "You get part of a transcript of the elder talking. It may be English, Nigerian Pidgin, or mixed with Yoruba, Igbo or Hausa, and the speech-to-text may have made mistakes.",
  "Use only what is in the transcript. Never invent people, places, dates or events. If something is not said, leave it out.",
  "Write in plain, warm English that a teenager and a grandparent can both read.",
].join(" ");

/** Who is speaking, as the prompts call them: "Grandma Adunni (the storyteller)". */
export function speakerLabel(elder = {}) {
  const name = String(elder.name || "").trim();
  return name || "the storyteller";
}

export function passageMessages({ passage, elder, index, total }) {
  const who = speakerLabel(elder);
  return [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: [
        `Transcript, part ${index + 1} of ${total}, of ${who} telling stories:`,
        `"""${passage}"""`,
        "",
        "Return JSON with:",
        `- title: a short chapter title (3 to 7 words) from what ${who} talks about here`,
        `- retelling: 2 to 4 sentences retelling this part in the third person, past tense, calling the speaker ${who}`,
        "- quote: one sentence copied exactly from the transcript that sounds most like the speaker, or an empty string",
        "- people: people named in the transcript, with who they are to the speaker if it is said (else an empty string)",
        "- places: towns, villages, schools, markets or countries named in the transcript, with a few words on why they matter",
        "- moments: things that happened, with when they happened as said in the transcript (a year, an age, or words like 'during the war')",
      ].join("\n"),
    },
  ];
}

export function bookMessages({ chapters, elder }) {
  const who = speakerLabel(elder);
  const outline = chapters.map((c, i) => `${i + 1}. ${c.title}: ${c.retelling}`).join("\n");
  return [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: [
        `These are the chapters of ${who}'s stories, as retold from a recording:`,
        outline,
        "",
        "Return JSON with:",
        "- title: a warm title for the whole story book, 3 to 8 words",
        `- questions: 4 or 5 short questions a grandchild could ask ${who} next time, about things the stories mention but do not explain. Each question names the person, place or event it is about.`,
      ].join("\n"),
    },
  ];
}

/**
 * Pull a JSON object out of a model's answer: plain JSON, JSON in a ``` fence, or the first
 * balanced {...}. Returns null when there is none.
 */
export function parseJsonAnswer(text) {
  if (text && typeof text === "object") return text;
  const t = String(text || "").trim();
  if (!t) return null;
  const tryParse = (s) => {
    try {
      const v = JSON.parse(s);
      return v && typeof v === "object" ? v : null;
    } catch {
      return null;
    }
  };
  const direct = tryParse(t);
  if (direct) return direct;
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (fence) {
    const v = tryParse(fence[1].trim());
    if (v) return v;
  }
  const start = t.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return tryParse(t.slice(start, i + 1));
  }
  return null;
}

const str = (v, max = 400) =>
  String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

const YEAR = /\b(1[6-9]\d\d|20\d\d)\b/g;

/** Years (as strings) mentioned in a text. */
export function yearsIn(text) {
  return [...new Set(String(text || "").match(YEAR) || [])];
}

/**
 * Keep only what the passage supports. Returns { chapter, people, places, moments, dropped }
 * where dropped lists what was left out and why (shown to the family as "checks").
 */
export function groundPassage(raw, passage, { elder } = {}) {
  const dropped = [];
  const r = raw && typeof raw === "object" ? raw : {};
  const elderName = fold(elder?.name || "");

  const named = (list, kind, max) => {
    const out = [];
    const seen = new Set();
    for (const item of Array.isArray(list) ? list : []) {
      const name = str(item?.name, 80);
      if (!name) continue;
      const key = fold(name);
      if (!key || seen.has(key)) continue;
      // the speaker is the book's subject, not a person "mentioned"
      if (kind === "person" && elderName && key === elderName) continue;
      if (!appearsIn(name, passage)) {
        dropped.push({ kind, value: name, why: "not in the recording" });
        continue;
      }
      seen.add(key);
      out.push({ name, note: str(item?.who ?? item?.note, 160) });
      if (out.length >= max) break;
    }
    return out;
  };

  let people = named(r.people, "person", 6);
  const places = named(r.places, "place", 6);
  // "born in Surulere": a "person" the transcript only ever puts after in/at/to/from is a place
  // (small models, and any model reading N1-style stand-ins, mix these up)
  const placeKeys = new Set(places.map((p) => fold(p.name)));
  people = people.filter((p) => {
    if (placeKeys.has(fold(p.name))) return false;
    if (looksLikePlace(p.name, passage)) {
      places.push({ name: p.name, note: "" });
      placeKeys.add(fold(p.name));
      return false;
    }
    return true;
  });

  let quote = str(r.quote, 300).replace(/^["“”']+|["“”']+$/g, "");
  if (quote && !appearsIn(quote, passage)) {
    dropped.push({ kind: "quote", value: quote, why: "not word for word in the recording" });
    quote = "";
  }

  const passageYears = new Set(yearsIn(passage));
  const moments = [];
  for (const m of Array.isArray(r.moments) ? r.moments : []) {
    const when = str(m?.when, 60);
    const what = str(m?.what, 200);
    if (!what) continue;
    const ys = yearsIn(`${when} ${what}`);
    const badYear = ys.find((y) => !passageYears.has(y));
    if (badYear) {
      dropped.push({ kind: "moment", value: `${when}: ${what}`, why: `${badYear} is not said in the recording` });
      continue;
    }
    moments.push({ when, what });
    if (moments.length >= 5) break;
  }

  let title = str(r.title, 80).replace(/^["“”']+|["“”']+$/g, "");
  let retelling = str(r.retelling, 900);
  // a retelling that brings in a year the passage never says is a sign of invention
  const tellYears = yearsIn(retelling).filter((y) => !passageYears.has(y));
  if (tellYears.length) dropped.push({ kind: "retelling", value: tellYears.join(", "), why: "the retelling mentioned a year not in the recording; check it" });
  if (!title) title = fallbackTitle(passage);
  if (!retelling) retelling = firstSentences(passage, 2);

  return { chapter: { title, retelling, quote }, people, places, moments, dropped };
}

/** Names written with a capital after the first word of a question ("Who was Tari?" -> ["Tari"]). */
function namesInQuestion(q) {
  return q
    .split(/\s+/)
    .slice(1)
    .map((w) => w.replace(/^[^\p{L}]+|[^\p{L}'’-]+$/gu, "").replace(/['’]s$/, ""))
    .filter((w) => /^\p{Lu}/u.test(w) && w.length > 1 && !COMMON.has(fold(w)));
}

/**
 * Clean the title and questions. With the transcript text, a question that names someone or
 * somewhere the recording never mentions is left out, like everything else Gemma invents.
 */
/** True when every mention of `name` in the text comes right after in, at, to, from or near. */
export function looksLikePlace(name, text) {
  const n = fold(name);
  const t = ` ${fold(text)} `;
  let i = t.indexOf(` ${n} `);
  if (i < 0) return false;
  let all = 0;
  let after = 0;
  while (i >= 0) {
    all++;
    const before = t.slice(Math.max(0, i - 6), i);
    if (/\b(in|at|to|from|near)$/.test(before)) after++;
    i = t.indexOf(` ${n} `, i + 1);
  }
  return after === all;
}

export function groundBook(raw, chapters, text = null) {
  const r = raw && typeof raw === "object" ? raw : {};
  const dropped = [];
  let title = str(r.title, 90).replace(/^["“”']+|["“”']+$/g, "");
  if (!title) title = chapters[0]?.title || "Our family's stories";
  const questions = [];
  for (const raw of Array.isArray(r.questions) ? r.questions : []) {
    let q = str(raw, 200);
    if (q.length <= 8) continue;
    if (!/[?]$/.test(q)) q = `${q.replace(/[.!]+$/, "")}?`;
    if (text != null) {
      const missing = namesInQuestion(q).find((n) => !appearsIn(n, text));
      const year = yearsIn(q).find((y) => !yearsIn(text).includes(y));
      if (missing || year) {
        dropped.push({ kind: "question", value: q, why: `${missing ? `"${missing}"` : year} is not in the recording` });
        continue;
      }
    }
    questions.push(q);
    if (questions.length >= 6) break;
  }
  return { title, questions, dropped };
}

function firstSentences(text, n) {
  return sentences(text).slice(0, n).join(" ");
}

function fallbackTitle(text) {
  const words = String(sentences(text)[0] || text || "")
    .split(/\s+/)
    .slice(0, 6)
    .join(" ")
    .replace(/[.,;:!?]+$/, "");
  return words || "A story";
}

/** Merge per-passage results into one book (people and places de-duplicated across chapters). */
export function assembleBook({ elder, results, book, source, model, transcriptWords }) {
  const people = new Map();
  const places = new Map();
  const timeline = [];
  const dropped = [];
  const chapters = [];
  results.forEach((r, i) => {
    chapters.push({ ...r.chapter, n: i + 1 });
    for (const p of r.people) {
      const k = fold(p.name);
      if (!people.has(k)) people.set(k, { ...p, chapters: [i + 1] });
      else {
        const e = people.get(k);
        if (!e.note && p.note) e.note = p.note;
        if (!e.chapters.includes(i + 1)) e.chapters.push(i + 1);
      }
    }
    for (const p of r.places) {
      const k = fold(p.name);
      if (!places.has(k)) places.set(k, { ...p, chapters: [i + 1] });
      else if (!places.get(k).chapters.includes(i + 1)) places.get(k).chapters.push(i + 1);
    }
    r.moments.forEach((m, j) => timeline.push({ ...m, chapter: i + 1, order: i * 100 + j }));
    dropped.push(...r.dropped.map((d) => ({ ...d, chapter: i + 1 })));
  });
  dropped.push(...(book.dropped || []));
  // dated moments in year order first, then the undated ones in the order they were told
  const year = (m) => +(yearsIn(`${m.when} ${m.what}`)[0] || NaN);
  const dated = timeline.filter((m) => Number.isFinite(year(m))).sort((a, b) => year(a) - year(b) || a.order - b.order);
  const undated = timeline.filter((m) => !Number.isFinite(year(m))).sort((a, b) => a.order - b.order);
  timeline.length = 0;
  timeline.push(...dated, ...undated);
  return {
    version: 1,
    title: book.title,
    elder: { name: elder?.name || "", relation: elder?.relation || "" },
    chapters,
    people: [...people.values()],
    places: [...places.values()],
    timeline: timeline.map(({ order, ...m }) => m),
    questions: book.questions,
    checks: dropped,
    made: { at: new Date().toISOString(), by: model, where: source, transcriptWords },
  };
}

/**
 * Make the story book with a backend: { run(messages, schema, maxTokens) -> text }.
 * onStep({ step, of, label }) reports progress; signal stops between steps.
 */
export async function makeBook({ text, elder, backend, passageWords = 450, onStep, signal }) {
  const parts = passages(text, passageWords);
  if (!parts.length) throw Object.assign(new Error("There is no transcript yet."), { hint: "Write down at least one story first, or type what was said." });
  const of = parts.length + 1;
  const results = [];
  for (let i = 0; i < parts.length; i++) {
    signal?.throwIfAborted?.();
    onStep?.({ step: i + 1, of, label: `Reading part ${i + 1} of ${parts.length}` });
    const msgs = passageMessages({ passage: parts[i], elder, index: i, total: parts.length });
    // an answer that is not JSON (cut off, or chatty) gets one more try
    let data = parseJsonAnswer(await backend.run(msgs, PASSAGE_SCHEMA, 700));
    if (!data) {
      signal?.throwIfAborted?.();
      data = parseJsonAnswer(await backend.run(msgs, PASSAGE_SCHEMA, 700));
    }
    results.push(groundPassage(data, parts[i], { elder }));
  }
  signal?.throwIfAborted?.();
  onStep?.({ step: of, of, label: "Writing the title and questions" });
  const chapters = results.map((r) => r.chapter);
  let bookAnswer = parseJsonAnswer(await backend.run(bookMessages({ chapters, elder }), BOOK_SCHEMA, 400));
  if (!bookAnswer) bookAnswer = parseJsonAnswer(await backend.run(bookMessages({ chapters, elder }), BOOK_SCHEMA, 400));
  // the storyteller's own name may not be said in the recording, but questions may use it
  const book = groundBook(bookAnswer, chapters, `${text} ${elder?.name || ""}`);
  return assembleBook({ elder, results, book, source: backend.where, model: backend.model, transcriptWords: wordCount(text) });
}
