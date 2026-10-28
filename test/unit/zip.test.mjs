import { test } from "node:test";
import assert from "node:assert/strict";
import { crc32, makeZip, readZip, safePath } from "../../src/lib/zip.js";

test("crc32 matches the known value for '123456789'", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

test("a zip round-trips text, bytes and blobs with UTF-8 names", async () => {
  const audio = new Uint8Array([0, 1, 2, 250, 255]);
  const zip = await makeZip([
    { name: "Ìyá Àgbà/transcript.txt", data: "Ẹ káàárọ̀, Mama" },
    { name: "audio/story-1.webm", data: new Blob([audio]) },
    { name: "empty.txt", data: "" },
  ]);
  assert.equal(zip.type, "application/zip");
  const files = await readZip(zip);
  assert.deepEqual(Object.keys(files), ["Ìyá Àgbà/transcript.txt", "audio/story-1.webm", "empty.txt"]);
  assert.equal(new TextDecoder().decode(files["Ìyá Àgbà/transcript.txt"]), "Ẹ káàárọ̀, Mama");
  assert.deepEqual([...files["audio/story-1.webm"]], [...audio]);
  assert.equal(files["empty.txt"].length, 0);
});

test("duplicate names get a number instead of overwriting", async () => {
  const files = await readZip(await makeZip([{ name: "a.txt", data: "1" }, { name: "a.txt", data: "2" }]));
  assert.deepEqual(Object.keys(files), ["a.txt", "a (2).txt"]);
});

test("unsafe paths are cleaned", () => {
  assert.equal(safePath("../../etc/passwd"), "etc/passwd");
  assert.equal(safePath("/abs/x:y?.txt"), "abs/xy.txt");
  assert.equal(safePath("a\\b\\c.txt"), "a/b/c.txt");
});

test("a damaged entry is refused", async () => {
  const bytes = new Uint8Array(await (await makeZip([{ name: "a.txt", data: "hello" }])).arrayBuffer());
  bytes[30 + 5] ^= 0xff; // first data byte
  await assert.rejects(readZip(bytes), /damaged/);
});
