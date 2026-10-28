// Small text helpers shared by the story book, the checks and the archive.

/** Lower case, accents and tone marks removed, punctuation to spaces: "Ọ̀ṣun!" -> "osun". */
export function fold(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[ɓ]/g, "b")
    .replace(/[ɗ]/g, "d")
    .replace(/[ƙ]/g, "k")
    .replace(/[ƴ]/g, "y")
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Split text into sentences (keeps the end mark). */
export function sentences(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return [];
  const out = t.match(/[^.!?…]+(?:[.!?…]+["”’)\]]*|$)/g) || [t];
  return out.map((s) => s.trim()).filter(Boolean);
}

export function wordCount(text) {
  const m = String(text || "").match(/[\p{L}\p{N}’'-]+/gu);
  return m ? m.length : 0;
}

/**
 * Cut text into passages of at most `maxWords` words, on sentence boundaries where possible.
 * A single sentence longer than maxWords is cut on word boundaries.
 */
export function passages(text, maxWords = 450) {
  const out = [];
  let cur = [];
  let n = 0;
  const push = () => {
    if (cur.length) out.push(cur.join(" "));
    cur = [];
    n = 0;
  };
  for (const s of sentences(text)) {
    const w = wordCount(s);
    if (w > maxWords) {
      push();
      const words = s.split(/\s+/);
      for (let i = 0; i < words.length; i += maxWords) out.push(words.slice(i, i + maxWords).join(" "));
      continue;
    }
    if (n + w > maxWords) push();
    cur.push(s);
    n += w;
  }
  push();
  return out;
}

/** True when `needle` (a name or a quote) appears in `hay`, ignoring case, accents and punctuation. */
export function appearsIn(needle, hay) {
  const n = fold(needle);
  if (!n) return false;
  return ` ${fold(hay)} `.includes(` ${n} `);
}

/** "00:03:07" style label for seconds. */
export function clock(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  return h ? `${h}:${mm}:${String(r).padStart(2, "0")}` : `${mm}:${String(r).padStart(2, "0")}`;
}

/** A file-name-safe version of a title, keeping letters with tone marks. */
export function fileSafe(s, fallback = "story") {
  const t = String(s || "")
    .normalize("NFC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return t || fallback;
}

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// capitalised words that are not names (sentence starters are skipped anyway)
export const COMMON = new Set(
  "i i'm i'll i've i'd god oh ok okay mr mrs miss dr sir ma madam chief alhaji alhaja mama papa baba iya oga grandma grandpa grandmother grandfather granny aunty auntie aunt uncle father mother brother sister husband wife son daughter friend best day her his she he they we my our their in at on of to from with for by as when where what who how why which was is it this that monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december christmas easter english pidgin yoruba igbo hausa the a an and but so then".split(" "),
);

/** Replace a whole word or phrase everywhere, ignoring case: fixName("born in Worry", "worry", "Warri"). */
export function replaceWord(text, from, to) {
  const f = String(from || "").trim();
  if (!f) return { text, n: 0 };
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "giu");
  let n = 0;
  const out = String(text || "").replace(re, () => (n++, to));
  return { text: out, n };
}
