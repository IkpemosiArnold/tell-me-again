import { test } from "node:test";
import assert from "node:assert/strict";
import { fixNameEverywhere, namesToCheck } from "../../src/lib/names.js";

const session = () => ({
  stories: [
    { transcript: { lines: [{ s: 0, e: 4, text: "I was born in Worry in 1951." }, { s: 4, e: 8, text: "My father, Paparacoro, fished on the river." }] } },
    { typed: "Later we left Worry for Lagos." },
  ],
});

test("names to check come with the sentence they were heard in", () => {
  const list = namesToCheck(session());
  const worry = list.find((x) => x.name === "Worry");
  assert.equal(worry.n, 2);
  assert.equal(worry.said, "I was born in Worry in 1951.");
  assert.ok(list.some((x) => x.name === "Paparacoro"));
});

test("a fix reaches every story, transcript and typed text", () => {
  const s = session();
  assert.equal(fixNameEverywhere(s, "Worry", "Warri"), 2);
  assert.equal(s.stories[0].transcript.lines[0].text, "I was born in Warri in 1951.");
  assert.equal(s.stories[0].transcript.edited, true);
  assert.equal(s.stories[1].typed, "Later we left Warri for Lagos.");
  assert.equal(fixNameEverywhere(s, "Paparacoro", "  "), 0);
});
