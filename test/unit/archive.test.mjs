import { test } from "node:test";
import assert from "node:assert/strict";
import { archiveName, buildArchive, openArchive } from "../../src/lib/archive.js";
import { readZip } from "../../src/lib/zip.js";
import { renderBookHtml, storyText, transcriptTxt } from "../../src/lib/bookhtml.js";

const session = {
  id: "s-1",
  createdAt: "2026-10-28T10:00:00.000Z",
  elder: { name: "Grandma Test", relation: "grandmother" },
  consent: { blobId: "b-c", mime: "audio/webm;codecs=opus", seconds: 6, at: "2026-10-28T10:00:05.000Z", words: "I am happy for my family to record and keep my stories." },
  stories: [
    { id: "t1", blobId: "b-1", mime: "audio/mp4", seconds: 65, lang: "en", title: "The market", transcript: { by: "Whisper base", lines: [{ s: 0, e: 4, text: "I was born in Abeokuta." }, { s: 4, e: 9, text: "My mother sold <cloth>." }] } },
    { id: "t2", blobId: "b-2", mime: "audio/webm", seconds: 30, lang: "yo", typed: "Summary typed by a grandchild." },
  ],
  book: {
    title: "Indigo & Days",
    elder: { name: "Grandma Test" },
    chapters: [{ n: 1, title: "Born in Abeokuta", retelling: "She was born in Abeokuta.", quote: "I was born in Abeokuta." }],
    people: [],
    places: [{ name: "Abeokuta", note: "where she was born" }],
    timeline: [],
    questions: ["What did your mother sell?"],
    checks: [{ kind: "person", value: "Uncle X", why: "not in the recording" }],
    made: { by: "gemma-3-1b-it-Q4_0", where: "device", at: "2026-10-28T11:00:00.000Z" },
  },
};
const blobs = { "b-c": new Blob(["consent-bytes"]), "b-1": new Blob(["story-1"]), "b-2": new Blob(["story-2"]) };

test("the archive holds consent, audio, transcript, book and session data", async () => {
  const zip = await buildArchive(session, async (id) => blobs[id]);
  const files = await readZip(zip);
  const names = Object.keys(files).map((n) => n.split("/").slice(1).join("/"));
  assert.deepEqual(names.sort(), ["README.txt", "audio/01 - The market.m4a", "audio/02 - Story 2.webm", "consent/consent.txt", "consent/consent.webm", "session.json", "story-book.html", "transcript.txt"].sort());
  assert.ok(Object.keys(files)[0].startsWith("Grandma Test - stories - 2026-10-28/"));
  assert.equal(archiveName(session), "Grandma Test - stories - 2026-10-28.zip");
});

test("an archive opens again as a new session with its audio", async () => {
  let n = 0;
  const zip = await buildArchive(session, async (id) => blobs[id]);
  const { session: back, blobs: got } = await openArchive(zip, (p) => `${p}-new-${++n}`);
  assert.notEqual(back.id, session.id);
  assert.equal(back.stories.length, 2);
  assert.equal(await got.get(back.stories[0].blobId).text(), "story-1");
  assert.equal(await got.get(back.consent.blobId).text(), "consent-bytes");
  assert.equal(back.book.title, "Indigo & Days");
  await assert.rejects(openArchive(new Blob([new Uint8Array(30)])), /ZIP|archive/);
});

test("the book HTML is escaped, self-contained and honest about how it was made", () => {
  const html = renderBookHtml(session.book, session);
  assert.match(html, /<title>Indigo &amp; Days<\/title>/);
  assert.doesNotMatch(html, /<script|https?:\/\//);
  assert.match(html, /checked against the transcript/);
  assert.match(html, /\(1 item\)/);
});

test("transcript text keeps times and says what is typed", () => {
  const t = transcriptTxt(session);
  assert.match(t, /\[0:04\] My mother sold <cloth>\./);
  assert.match(t, /Typed by the family:/);
  assert.equal(storyText(session.stories[1]), "Summary typed by a grandchild.");
  assert.equal(storyText(session.stories[0]), "I was born in Abeokuta. My mother sold <cloth>.");
});
