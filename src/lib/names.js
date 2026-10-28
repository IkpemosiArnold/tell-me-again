// Names in the transcript, for the "Did she say...?" check before the story book. Whisper
// writes names it has never heard as something it has: Warri became "Worry", Papa Okoro
// became "Paparacoro". The model then builds the book on the wrong name. So before the book,
// the family sees every capitalised name with the sentence it came from, and fixes any that
// came out wrong, once, in every story.
import { capitalisedNames } from "./outline.js";
import { firstMention } from "./book.js";
import { replaceWord } from "./text.js";
import { storyText } from "./bookhtml.js";

/** [{ name, said, n }] for the session, most mentioned first, at most `max`. */
export function namesToCheck(session, max = 14) {
  const text = session.stories.map(storyText).join(" ");
  return capitalisedNames(text)
    .slice(0, max)
    .map(({ name, n }) => ({ name, n, said: firstMention(name, text) }));
}

/** Replace `from` with `to` (whole words) in every story's lines and typed text. Returns the count. */
export function fixNameEverywhere(session, from, to) {
  let n = 0;
  const target = String(to || "").trim();
  if (!String(from || "").trim() || !target) return 0;
  for (const st of session.stories) {
    if (st.transcript?.lines) {
      let changed = 0;
      st.transcript.lines = st.transcript.lines.map((l) => {
        const r = replaceWord(l.text, from, target);
        changed += r.n;
        return r.n ? { ...l, text: r.text } : l;
      });
      if (changed) st.transcript.edited = true;
      n += changed;
    }
    if (st.typed) {
      const r = replaceWord(st.typed, from, target);
      n += r.n;
      st.typed = r.text;
    }
  }
  return n;
}
