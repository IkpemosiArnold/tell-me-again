import { test } from "node:test";
import assert from "node:assert/strict";
import { LANGUAGES, canTranscribe, planFor } from "../../src/lib/languages.js";

test("every language says how far to trust it and why", () => {
  for (const l of LANGUAGES) {
    assert.ok(["good", "fair", "rough", "none"].includes(l.level), l.id);
    assert.ok(l.note.length > 20 && l.why.length > 20, l.id);
  }
});

test("Yoruba, Igbo and Hausa are not transcribed on the device; English and Pidgin are", () => {
  assert.equal(canTranscribe("en"), true);
  assert.equal(canTranscribe("pcm"), true);
  for (const id of ["yo", "ig", "ha"]) assert.equal(canTranscribe(id), false);
  assert.equal(planFor("pcm").level, "rough");
  assert.equal(planFor("mix").transcribe, true);
  assert.equal(planFor("xx").transcribe, false);
});

test("no language claims to write itself well", () => {
  assert.ok(!LANGUAGES.some((l) => l.level === "good"));
});
