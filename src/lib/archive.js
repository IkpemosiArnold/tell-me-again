// The family archive as one .zip: the consent recording, every story's audio, the
// transcripts, the story book (HTML) and session.json, which lets this app open it again.
// getBlob(id) supplies the audio, so this module has no browser storage of its own.

import { makeZip, readZip } from "./zip.js";
import { renderBookHtml, transcriptTxt } from "./bookhtml.js";
import { clock, fileSafe } from "./text.js";

const ext = (mime = "") => (/webm/.test(mime) ? "webm" : /ogg/.test(mime) ? "ogg" : /mp4|m4a|aac/.test(mime) ? "m4a" : /mpeg|mp3/.test(mime) ? "mp3" : /wav/.test(mime) ? "wav" : /quicktime/.test(mime) ? "mov" : "audio");
const pad = (n) => String(n).padStart(2, "0");
const day = (iso) => {
  const d = new Date(iso || Date.now());
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** "Grandma Adunni - stories - 2026-10-28.zip" */
export function archiveName(session) {
  const who = fileSafe(session.elder?.name, "Family");
  return `${who} - stories - ${day(session.createdAt)}.zip`;
}

export function readme(session) {
  const who = session.elder?.name || "the storyteller";
  return [
    `Stories told by ${who}, recorded on ${day(session.createdAt)} with Tell Me Again.`,
    "",
    "What is in this folder:",
    "  consent/       the recorded consent at the start of the session",
    "  audio/         every story as it was recorded (the true record)",
    "  transcript.txt what was written down, with times; check it against the audio",
    "  story-book.html the family story book; open it in any browser, or print it",
    "  session.json   the same session as data, so Tell Me Again can open it again",
    "",
    "Nothing in this archive was stored on a server. Keep a copy somewhere safe,",
    "and ask before sharing someone's voice.",
    "",
  ].join("\n");
}

export async function buildArchive(session, getBlob) {
  const folder = `${fileSafe(session.elder?.name, "Family")} - stories - ${day(session.createdAt)}`;
  const entries = [{ name: `${folder}/README.txt`, data: readme(session) }];
  const record = structuredClone(session);
  if (session.consent?.blobId) {
    const blob = await getBlob(session.consent.blobId);
    if (blob) {
      const name = `consent/consent.${ext(session.consent.mime)}`;
      entries.push({ name: `${folder}/${name}`, data: blob });
      record.consent.file = name;
    }
    entries.push({
      name: `${folder}/consent/consent.txt`,
      data: `Consent recorded ${session.consent.at} (${clock(session.consent.seconds)}).\n${session.consent.words ? `Suggested words shown on screen: "${session.consent.words}"\n` : ""}`,
    });
  }
  for (const [i, s] of session.stories.entries()) {
    if (!s.blobId) continue;
    const blob = await getBlob(s.blobId);
    if (!blob) continue;
    const name = `audio/${pad(i + 1)} - ${fileSafe(s.title, `Story ${i + 1}`)}.${ext(s.mime)}`;
    entries.push({ name: `${folder}/${name}`, data: blob });
    record.stories[i].file = name;
  }
  entries.push({ name: `${folder}/transcript.txt`, data: transcriptTxt(session) });
  if (session.book) entries.push({ name: `${folder}/story-book.html`, data: renderBookHtml(session.book, session) });
  entries.push({ name: `${folder}/session.json`, data: JSON.stringify({ app: "tell-me-again", version: 1, session: record }, null, 2) });
  return makeZip(entries);
}

/**
 * Open an archive made by buildArchive. Resolves { session, blobs: Map(blobId -> Blob) }.
 * The session gets a new id so it never overwrites one already on this device.
 */
export async function openArchive(zipBlob, newId) {
  const files = await readZip(zipBlob);
  const metaName = Object.keys(files).find((n) => n.endsWith("session.json"));
  if (!metaName) throw new Error("This is not a Tell Me Again archive (no session.json).");
  const folder = metaName.slice(0, -"session.json".length);
  const meta = JSON.parse(new TextDecoder().decode(files[metaName]));
  if (meta.app !== "tell-me-again" || !meta.session) throw new Error("This is not a Tell Me Again archive.");
  const session = meta.session;
  const blobs = new Map();
  const take = (item, mime) => {
    if (!item?.file || !files[folder + item.file]) return null;
    const id = newId("b");
    blobs.set(id, new Blob([files[folder + item.file]], { type: mime || "application/octet-stream" }));
    return id;
  };
  session.id = newId("s");
  if (session.consent) session.consent.blobId = take(session.consent, session.consent.mime);
  session.stories = session.stories.map((s) => ({ ...s, blobId: take(s, s.mime) }));
  return { session, blobs };
}
