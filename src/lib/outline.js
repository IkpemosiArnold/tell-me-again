// An outline made without any AI, for a phone that cannot run Gemma when the family does
// not want to send text to Google. It finds what plain rules can find: the names written
// with capital letters in the middle of a sentence, and the sentences that mention a year.
// It never retells anything.

import { yearsIn } from "./book.js";
import { fold, sentences, wordCount } from "./text.js";

// capitalised words that are not names (sentence starters are skipped anyway)
const COMMON = new Set(
  "i i'm i'll i've i'd god oh ok okay mr mrs miss dr sir ma madam chief alhaji alhaja mama papa baba iya oga monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december christmas easter english pidgin yoruba igbo hausa the a an and but so then".split(" "),
);

/** Names written with a capital in the middle of a sentence ("we moved to Ibadan"). */
export function capitalisedNames(text) {
  const counts = new Map();
  for (const s of sentences(text)) {
    const words = s.split(/\s+/);
    for (let i = 1; i < words.length; i++) {
      // join runs like "Mama Bisi" or "Saint Anne's"
      const run = [];
      while (i < words.length && /^[\p{Lu}][\p{L}’'-]*[.,;:!?]?$/u.test(words[i])) {
        run.push(words[i].replace(/[.,;:!?]+$/, ""));
        const ended = /[.,;:!?]$/.test(words[i]);
        i++;
        if (ended) break;
      }
      // a lone common word ("Mama", "God") is not a name; "Mama Ronke" is
      const kept = run.length === 1 && COMMON.has(fold(run[0])) ? [] : run[0] && fold(run[0]) === "the" ? run.slice(1) : run;
      const name = kept.join(" ").trim();
      if (name && name.length > 1) counts.set(name, (counts.get(name) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n }));
}

/** stories: [{ title?, text }] one per recorded story. */
export function makeOutline({ stories, elder }) {
  const all = stories.map((s) => s.text).join(" ");
  const chapters = stories
    .filter((s) => s.text && s.text.trim())
    .map((s, i) => ({ n: i + 1, title: s.title || `Story ${i + 1}`, retelling: "", quote: "", firstLine: sentences(s.text)[0] || "" }));
  const timeline = [];
  stories.forEach((s, i) => {
    for (const sent of sentences(s.text)) {
      const ys = yearsIn(sent);
      if (ys.length) timeline.push({ when: ys[0], what: sent.slice(0, 200), chapter: i + 1 });
    }
  });
  timeline.sort((a, b) => +a.when - +b.when);
  return {
    version: 1,
    kind: "outline",
    title: elder?.name ? `${elder.name}'s stories` : "Our family's stories",
    elder: { name: elder?.name || "", relation: elder?.relation || "" },
    chapters,
    people: capitalisedNames(all).slice(0, 20).map(({ name }) => ({ name, note: "" })),
    places: [],
    timeline,
    questions: [],
    checks: [],
    made: { at: new Date().toISOString(), by: "rules (no AI)", where: "device", transcriptWords: wordCount(all) },
  };
}
