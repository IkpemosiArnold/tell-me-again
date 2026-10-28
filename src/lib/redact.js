// "Hide names before sending": when a family chooses Google's Gemma for the story book, the
// names in the transcript can be swapped for stand-ins (N1, N2, ...) before the text leaves
// the phone, and swapped back in the answer on the phone. Google then sees "N1 was born in
// N2 in 1948", not who or where. It is a rule, not a guarantee: a name written in lower
// case, or a nickname, can slip through, and the page says so.

import { COMMON, capitalisedNames } from "./outline.js";
import { fold } from "./text.js";

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** { text, map } where map is [[stand-in, original], ...]. */
export function hideNames(text, { extra = [] } = {}) {
  const found = [...extra.map((s) => String(s || "").trim()).filter(Boolean), ...capitalisedNames(text).map((n) => n.name)];
  // the parts of "Mama Ronke" too, so "Ronke" at the start of a sentence is caught
  const parts = found.flatMap((n) => (n.includes(" ") ? n.split(/\s+/).filter((w) => w.length > 2 && !COMMON.has(fold(w))) : []));
  const names = [...new Set([...found, ...parts])]
    // longest first, so "Mama Ronke" is replaced before "Ronke"
    .sort((a, b) => b.length - a.length);
  const map = [];
  let out = String(text || "");
  names.forEach((name) => {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(name)}(?![\\p{L}\\p{N}])`, "gu");
    if (!re.test(out)) return;
    const token = `N${map.length + 1}`;
    out = out.replace(re, token);
    map.push([token, name]);
  });
  return { text: out, map };
}

/** Swap the names in `map` (from hideNames) for their stand-ins in another text. */
export function applyNames(text, map) {
  let out = String(text || "");
  for (const [token, name] of [...map].sort((a, b) => b[1].length - a[1].length)) {
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(name)}(?![\\p{L}\\p{N}])`, "gu"), token);
  }
  return out;
}

/** Put the names back into every string inside value (objects, arrays, strings). */
export function restoreNames(value, map) {
  if (!map?.length) return value;
  // highest number first, so N12 is not read as N1 followed by "2"
  const ordered = [...map].sort((a, b) => +b[0].slice(1) - +a[0].slice(1));
  const fix = (s) => ordered.reduce((acc, [token, name]) => acc.replace(new RegExp(`(?<![\\p{L}\\p{N}])${token}(?![\\p{N}])`, "gu"), name), s);
  const walk = (v) => {
    if (typeof v === "string") return fix(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value);
}
