// The story book as one self-contained HTML file: no scripts, no fonts or images to fetch,
// readable offline in any browser for as long as browsers open HTML, and printable.

import { clock, escapeHtml as e, noteCase } from "./text.js";
import { language } from "./languages.js";

const fmtDate = (iso) => {
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return "";
  }
};

export function storyText(story) {
  if (story.typed && story.typed.trim()) return story.typed.trim();
  return (story.transcript?.lines || []).map((l) => l.text).join(" ").trim();
}

export function transcriptTxt(session) {
  const out = [];
  session.stories.forEach((s, i) => {
    const lang = s.lang === "mix" ? "a mix of languages" : language(s.lang)?.name || s.lang;
    out.push(`Story ${i + 1}${s.title ? `: ${s.title}` : ""} (${lang}, ${clock(s.seconds)})`);
    if (s.typed?.trim()) out.push("Typed by the family:", s.typed.trim());
    if (s.transcript?.lines?.length) {
      out.push(`Written down on the device by ${s.transcript.by}. Check it against the audio.`);
      for (const l of s.transcript.lines) out.push(`[${clock(l.s)}] ${l.text}`);
    }
    if (!s.typed?.trim() && !s.transcript?.lines?.length) out.push("(Not written down yet. The audio is in the audio folder.)");
    out.push("");
  });
  return out.join("\n");
}

export function renderBookHtml(book, session) {
  const who = book.elder?.name || session?.elder?.name || "";
  const made = book.made || {};
  const by = made.where === "google" ? `${made.by} through Google's Gemini API` : made.by;
  const list = (items, fn) => (items?.length ? `<ul>${items.map(fn).join("")}</ul>` : "<p class=\"none\">None found in the recording.</p>");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(book.title)}</title>
<style>
  :root { color-scheme: light dark; --ink: #1b2240; --soft: #3d4566; --page: #fbfaf7; --line: #d9dbe6; --lamp: #8a4f00; }
  @media (prefers-color-scheme: dark) { :root { --ink: #f1efe9; --soft: #c9cbe0; --page: #151a2e; --line: #343b5c; --lamp: #f4b942; } }
  body { margin: 0; background: var(--page); color: var(--ink); font: 18px/1.65 Georgia, "Iowan Old Style", "Noto Serif", serif; }
  main { max-width: 38rem; margin: 0 auto; padding: 3rem 1.25rem 4rem; }
  h1 { font-size: 2.1rem; line-height: 1.15; margin: 0 0 .5rem; font-weight: 600; }
  h2 { font-size: 1.35rem; margin: 2.6rem 0 .6rem; }
  h3 { font-size: 1.1rem; margin: 2rem 0 .3rem; }
  .meta { color: var(--soft); font-size: .95rem; }
  blockquote { margin: 1rem 0; padding-left: 1rem; border-left: 3px solid var(--lamp); font-style: italic; }
  ul { padding-left: 1.2rem; }
  li { margin: .3rem 0; }
  .none { color: var(--soft); }
  .said { color: var(--soft); font-size: .92rem; font-style: italic; }
  .note { color: var(--soft); font-size: .9rem; border-top: 1px solid var(--line); margin-top: 3rem; padding-top: 1rem; }
  @media print { body { background: #fff; color: #000; } main { padding: 0; } h2 { break-after: avoid; } }
</style>
</head>
<body>
<main>
<h1>${e(book.title)}</h1>
<p class="meta">${who ? `Told by ${e(who)}. ` : ""}Recorded ${e(fmtDate(session?.createdAt || made.at))}.</p>
${book.chapters
  .map(
    (c) => `<h2>${e(c.n)}. ${e(c.title)}</h2>
${c.retelling ? `<p>${e(c.retelling)}</p>` : ""}${c.firstLine && !c.retelling ? `<p>${e(c.firstLine)}</p>` : ""}
${c.quote ? `<blockquote>${e(c.quote)}</blockquote>` : ""}`,
  )
  .join("\n")}
<h2>People</h2>
${list(book.people, (p) => `<li><strong>${e(p.name)}</strong>${p.note ? `, ${e(noteCase(p.note))}` : ""}${!p.note && p.said ? `<br><span class="said">“${e(p.said)}”</span>` : ""}</li>`)}
<h2>Places</h2>
${list(book.places, (p) => `<li><strong>${e(p.name)}</strong>${p.note ? `, ${e(noteCase(p.note))}` : ""}${!p.note && p.said ? `<br><span class="said">“${e(p.said)}”</span>` : ""}</li>`)}
<h2>Timeline</h2>
${list(book.timeline, (m) => `<li><strong>${e(m.when || "Undated")}</strong>: ${e(m.what)}</li>`)}
${book.questions?.length ? `<h2>Questions to ask next time</h2>\n${list(book.questions, (q) => `<li>${e(q)}</li>`)}` : ""}
<p class="note">${
    book.kind === "outline"
      ? "This outline was made by simple rules on the device, without AI."
      : `The retellings were written by ${e(by)} from the transcript. Names, places, years and quotes were checked against the transcript, and anything not found in it was left out${book.checks?.length ? ` (${book.checks.length} item${book.checks.length === 1 ? "" : "s"})` : ""}. The recordings are the true record.`
  }</p>
</main>
</body>
</html>
`;
}
