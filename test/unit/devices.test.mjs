import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseRuntimes, downloadAdvice } from "../../src/engine/devices.js";
import { GEMMA, SPEECH, speechBytes } from "../../src/engine/models.js";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1";
const IPAD = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

test("phones get the small speech model and only the small Gemma", () => {
  for (const facts of [{ ua: IPHONE }, { ua: IPAD, maxTouchPoints: 5 }, { ua: ANDROID, deviceMemoryGb: 8 }, { ua: MAC, deviceMemoryGb: 4 }]) {
    const r = chooseRuntimes(facts);
    assert.equal(r.phone, true, facts.ua);
    assert.equal(r.speech, "tiny");
    assert.deepEqual(r.gemma, ["gemma3-270m"]);
  }
});

test("laptops get whisper base and Gemma 1B first", () => {
  const r = chooseRuntimes({ ua: MAC, deviceMemoryGb: 8 });
  assert.equal(r.phone, false);
  assert.equal(r.speech, "base");
  assert.equal(r.defaultGemma, "gemma3-1b");
  assert.equal(chooseRuntimes({ ua: MAC }, { speech: "tiny" }).speech, "tiny");
});

test("models a phone may load stay under the size where iPhone tabs crash", () => {
  assert.ok(GEMMA["gemma3-270m"].size < 300e6);
  assert.ok(speechBytes(SPEECH.tiny) < 50e6);
  assert.ok(GEMMA["gemma3-1b"].size > 700e6, "the 1B model is the one phones must not get");
});

test("download advice flags mobile data", () => {
  assert.equal(downloadAdvice(1e8, { type: "cellular" }).metered, true);
  assert.equal(downloadAdvice(1e8, { saveData: true }).metered, true);
  assert.equal(downloadAdvice(1e8, { downlink: 8 }).estSec, 100);
  assert.equal(downloadAdvice(1e8, undefined).metered, false);
});
