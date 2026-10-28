import { test } from "node:test";
import assert from "node:assert/strict";
import { applyNames, hideNames, restoreNames } from "../../src/lib/redact.js";

const T = "I was born in Abeokuta in 1948. My mother, Mama Ronke, sold cloth. Ronke was strong. We later went to Ibadan.";

test("names are swapped for stand-ins, longest first", () => {
  const { text, map } = hideNames(T, { extra: ["Grandma Adunni"] });
  assert.doesNotMatch(text, /Abeokuta|Ronke|Ibadan/);
  assert.match(text, /1948/);
  const names = map.map((m) => m[1]);
  assert.ok(names.includes("Mama Ronke") && names.includes("Ronke") && names.includes("Abeokuta"));
  assert.ok(!names.includes("Grandma Adunni"), "a name not in the text is not mapped");
});

test("restoreNames walks objects and does not confuse N1 with N12", () => {
  const map = Array.from({ length: 12 }, (_, i) => [`N${i + 1}`, `Name${i + 1}`]);
  const out = restoreNames({ a: "N1 met N12.", b: ["N2's house"], c: 3 }, map);
  assert.deepEqual(out, { a: "Name1 met Name12.", b: ["Name2's house"], c: 3 });
});

test("a round trip gives the original text back", () => {
  const { text, map } = hideNames(T);
  assert.equal(restoreNames(text, map), T);
});

test("names found in the transcript are swapped in the instructions too, and nothing else is", () => {
  const { map } = hideNames(T, { extra: ["Grandma Adunni"] });
  const prompt = "Transcript of Grandma Adunni. Mama Ronke is her mother, from Abeokuta.";
  const out = applyNames(prompt, map);
  assert.match(out, /^Transcript of Grandma Adunni\./, "a name not in the transcript and the word Transcript stay");
  assert.doesNotMatch(out, /Ronke|Abeokuta/);
});
