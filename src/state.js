// What lives only in memory for this visit: the loaded speech model, the family's Google key
// (never saved), and which sessions they allowed to use Google. Closing the tab forgets all
// of it, which is the point: the opt-in is per session, every time.
import { createTranscriber } from "./engine/asr.js";
import { chooseRuntimes, deviceFacts } from "./engine/devices.js";

/** Test hooks (set by the end-to-end test before the page loads). Never set in normal use. */
export const testHooks = globalThis.__tellMeAgainTest || null;

export const runtimes = chooseRuntimes(deviceFacts(), { speech: testHooks?.speech });

let transcriber = null;
export function getTranscriber(size = runtimes.speech) {
  if (!transcriber || transcriber.size !== size) {
    transcriber?.stop();
    transcriber = createTranscriber(size);
    transcriber.size = size;
  }
  return transcriber;
}
export function stopTranscriber() {
  transcriber?.stop();
}

export const cloud = {
  key: "",
  /** session ids the family allowed to use Google for, this visit only */
  allowed: new Set(),
};

/** ₦ of mobile data for a download, at ₦500 a GB (MTN's 7 GB monthly plan, ₦3,500; mtn.ng, Aug 2026). */
export function nairaFor(bytes) {
  const n = (bytes / 1e9) * 500;
  return `₦${Math.max(10, Math.round(n / 10) * 10).toLocaleString("en-NG")}`;
}

export const QUESTIONS = [
  "Where did you grow up, and what did the house look like?",
  "What did your mother cook that nobody makes the same way now?",
  "Who was your best friend when you were small?",
  "What games did you play as a child?",
  "What was school like for you?",
  "What was the first work you did for money?",
  "What did your town celebrate, and how?",
  "Who in the family are you most like?",
  "What song do you remember from when you were young?",
  "What did things cost when you were young?",
  "Where were you when Nigeria became independent in 1960?",
  "Tell me about a time you were brave.",
  "What do you want your great-grandchildren to know?",
];

export function fmtDate(iso, opts = { day: "numeric", month: "long", year: "numeric" }) {
  try {
    return new Date(iso).toLocaleDateString("en-GB", opts);
  } catch {
    return "";
  }
}
