import { test } from "node:test";
import assert from "node:assert/strict";
import { appearsIn, clock, fileSafe, fold, passages, sentences, wordCount } from "../../src/lib/text.js";

test("fold removes tone marks and Hausa hooked letters", () => {
  assert.equal(fold("Ọ̀ṣun!"), "osun");
  assert.equal(fold("Ɗan Ƙasa"), "dan kasa");
  assert.equal(fold("Mama's"), "mamas");
});

test("appearsIn matches whole words only, ignoring accents and case", () => {
  const t = "We moved to Ìbàdàn in 1962, and Mama Bisi came with us.";
  assert.ok(appearsIn("Ibadan", t));
  assert.ok(appearsIn("mama bisi", t));
  assert.ok(!appearsIn("Bis", t));
  assert.ok(!appearsIn("Lagos", t));
  assert.ok(!appearsIn("", t));
});

test("sentences and passages keep sentence boundaries", () => {
  assert.deepEqual(sentences("One. Two? Three!"), ["One.", "Two?", "Three!"]);
  const long = Array.from({ length: 10 }, (_, i) => `Sentence number ${i} has six words.`).join(" ");
  const parts = passages(long, 15);
  assert.ok(parts.length >= 4);
  for (const p of parts) assert.ok(wordCount(p) <= 15, p);
  assert.equal(parts.join(" "), long);
});

test("a single very long sentence is cut on words", () => {
  const s = Array.from({ length: 25 }, () => "word").join(" ");
  const parts = passages(s, 10);
  assert.deepEqual(parts.map(wordCount), [10, 10, 5]);
});

test("clock and fileSafe", () => {
  assert.equal(clock(65), "1:05");
  assert.equal(clock(3725), "1:02:05");
  assert.equal(fileSafe('Mama: "Ìtàn"/1'), "Mama Ìtàn1");
  assert.equal(fileSafe("   "), "story");
});
