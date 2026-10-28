import { test } from "node:test";
import assert from "node:assert/strict";
import { assembleBook, groundBook, groundPassage, makeBook, parseJsonAnswer, passageMessages, yearsIn } from "../../src/lib/book.js";
import { makeOutline, capitalisedNames } from "../../src/lib/outline.js";

const PASSAGE =
  "I was born in Abeokuta in 1948. My mother, Mama Ronke, sold indigo cloth at Itoku market. " +
  "During the war we moved to Ibadan, and I started at Saint Anne's School. My brother Kunle carried my books.";

test("parseJsonAnswer reads plain, fenced and wrapped JSON", () => {
  assert.deepEqual(parseJsonAnswer('{"a":1}'), { a: 1 });
  assert.deepEqual(parseJsonAnswer('Sure!\n```json\n{"a":2}\n```'), { a: 2 });
  assert.deepEqual(parseJsonAnswer('Here: {"a":{"b":"}"}} trailing'), { a: { b: "}" } });
  assert.equal(parseJsonAnswer("no json"), null);
  assert.equal(parseJsonAnswer(""), null);
});

test("groundPassage keeps what the transcript says and drops what it does not", () => {
  const raw = {
    title: "Indigo and the move to Ibadan",
    retelling: "She was born in Abeokuta in 1948 and moved to Ibadan during the war.",
    quote: "My brother Kunle carried my books.",
    people: [
      { name: "Mama Ronke", who: "her mother" },
      { name: "Kunle", who: "her brother" },
      { name: "Uncle Tunde", who: "her uncle" }, // invented
      { name: "Grandma", who: "the speaker" },
    ],
    places: [
      { name: "Abeokuta", note: "where she was born" },
      { name: "Itoku market", note: "where her mother sold cloth" },
      { name: "Lagos", note: "" }, // invented
    ],
    moments: [
      { when: "1948", what: "Born in Abeokuta" },
      { when: "during the war", what: "Moved to Ibadan" },
      { when: "1955", what: "Started school" }, // year not said
    ],
  };
  const g = groundPassage(raw, PASSAGE, { elder: { name: "Grandma" } });
  assert.deepEqual(g.people.map((p) => p.name), ["Mama Ronke", "Kunle"]);
  assert.deepEqual(g.places.map((p) => p.name), ["Abeokuta", "Itoku market"]);
  assert.equal(g.chapter.quote, "My brother Kunle carried my books.");
  assert.deepEqual(g.moments.map((m) => m.when), ["1948", "during the war"]);
  const kinds = g.dropped.map((d) => `${d.kind}:${d.value}`);
  assert.ok(kinds.includes("person:Uncle Tunde"));
  assert.ok(kinds.includes("place:Lagos"));
  assert.ok(kinds.some((k) => k.startsWith("moment:1955")));
});

test("an invented quote is dropped, a missing title falls back to the first words", () => {
  const g = groundPassage({ quote: "We were very rich.", people: "nonsense" }, PASSAGE);
  assert.equal(g.chapter.quote, "");
  assert.equal(g.chapter.title, "I was born in Abeokuta in");
  assert.ok(g.chapter.retelling.startsWith("I was born"));
  assert.deepEqual(g.people, []);
});

test("a retelling with an unsaid year is flagged for checking", () => {
  const g = groundPassage({ title: "t", retelling: "In 1950 she married.", quote: "" }, PASSAGE);
  assert.ok(g.dropped.some((d) => d.kind === "retelling" && d.value === "1950"));
});

test("groundBook cleans questions", () => {
  const b = groundBook({ title: '"Indigo Days"', questions: ["What did Mama Ronke sell", "ok", "Who was Kunle?"] }, []);
  assert.equal(b.title, "Indigo Days");
  assert.deepEqual(b.questions, ["What did Mama Ronke sell?", "Who was Kunle?"]);
});

test("a question that names someone the recording never mentions is left out", () => {
  const b = groundBook({ title: "T", questions: ["Who was Tari?", "What did Mama Ronke sell at Itoku market?", "What happened in 1975?", "Did Uncle Invented visit?", "What was Grandma's first school?"] }, [], PASSAGE);
  assert.deepEqual(b.questions, ["What did Mama Ronke sell at Itoku market?", "What was Grandma's first school?"]);
  assert.deepEqual(b.dropped.map((d) => d.why), ['"Tari" is not in the recording', "1975 is not in the recording", '"Invented" is not in the recording']);
});

test("assembleBook merges people across chapters and orders the timeline by year", () => {
  const a = { chapter: { title: "A", retelling: "", quote: "" }, people: [{ name: "Kunle", note: "" }], places: [], moments: [{ when: "1960", what: "x" }, { when: "as a child", what: "y" }], dropped: [] };
  const b = { chapter: { title: "B", retelling: "", quote: "" }, people: [{ name: "kunle", note: "brother" }], places: [], moments: [{ when: "1948", what: "z" }], dropped: [{ kind: "person", value: "Q", why: "w" }] };
  const book = assembleBook({ elder: { name: "Mama" }, results: [a, b], book: { title: "T", questions: [] }, source: "device", model: "m", transcriptWords: 10 });
  assert.equal(book.people.length, 1);
  assert.equal(book.people[0].note, "brother");
  assert.deepEqual(book.people[0].chapters, [1, 2]);
  assert.deepEqual(book.timeline.map((m) => m.when), ["1948", "1960", "as a child"]);
  assert.equal(book.checks[0].chapter, 2);
});

test("makeBook runs one call per passage plus one for the book", async () => {
  const calls = [];
  const backend = {
    where: "device",
    model: "fake",
    async run(messages, schema) {
      calls.push(schema.required.join(","));
      if (schema.required.includes("retelling")) return JSON.stringify({ title: "Born in Abeokuta", retelling: "She was born.", quote: "", people: [{ name: "Kunle", who: "brother" }], places: [], moments: [] });
      return '```json\n{"title":"Indigo Days","questions":["Who was Kunle?","What did the market sell?","Why Ibadan?"]}\n```';
    },
  };
  const steps = [];
  const book = await makeBook({ text: `${PASSAGE} ${PASSAGE}`, elder: { name: "Mama" }, backend, passageWords: 40, onStep: (s) => steps.push(s.step) });
  assert.equal(calls.length, steps.length);
  assert.ok(calls.length >= 3);
  assert.equal(book.title, "Indigo Days");
  assert.equal(book.people.length, 1);
  assert.equal(book.made.by, "fake");
  await assert.rejects(makeBook({ text: "  ", backend }), /no transcript/);
});

test("the passage prompt forbids invention and names the speaker", () => {
  const m = passageMessages({ passage: "x", elder: { name: "Grandpa Obi" }, index: 0, total: 2 });
  assert.match(m[0].content, /Never invent/);
  assert.match(m[1].content, /Grandpa Obi/);
  assert.match(m[1].content, /part 1 of 2/);
});

test("years and the no-AI outline", () => {
  assert.deepEqual(yearsIn("in 1948 and 2001, not 12345"), ["1948", "2001"]);
  const names = capitalisedNames(PASSAGE).map((n) => n.name);
  assert.ok(names.includes("Abeokuta") && names.includes("Mama Ronke") && names.includes("Kunle"));
  const o = makeOutline({ stories: [{ text: PASSAGE }, { text: "" }], elder: { name: "Mama" } });
  assert.equal(o.kind, "outline");
  assert.equal(o.chapters.length, 1);
  assert.equal(o.timeline[0].when, "1948");
});
