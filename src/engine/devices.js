// What this device can run, decided in one place so the page says the same thing it does.
// The rule is pure (chooseRuntimes), so it is tested in Node.
//
// Phones get the small models. iOS closes a tab's process well before the phone's memory
// is used up (WebKit bug 277848, Aug 2024; WebKit bug 269777 saw about 1 GB of WebAssembly
// memory on a first load and 300 to 500 MB after a reload), and in Selects a 722 MB model
// on top of whisper crashed the tab on an iPhone. So on a phone the speech model is 41 MB,
// the local Gemma is the 242 MB one, and the 722 MB Gemma is not offered.

export const SMALL_MEMORY_GB = 4;

export function isAppleMobile(ua = "", maxTouchPoints = 0) {
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
}

export function isPhoneLike({ ua = "", maxTouchPoints = 0, deviceMemoryGb = null } = {}) {
  return isAppleMobile(ua, maxTouchPoints) || /Android|Mobile/.test(ua) || (deviceMemoryGb != null && deviceMemoryGb <= SMALL_MEMORY_GB);
}

/**
 * @returns {{ phone: boolean, speech: "tiny"|"base", gemma: string[], defaultGemma: string }}
 * gemma lists the local models this device may run, best first.
 */
export function chooseRuntimes(facts = {}, prefs = {}) {
  const phone = isPhoneLike(facts);
  const speech = prefs.speech === "tiny" || prefs.speech === "base" ? prefs.speech : phone ? "tiny" : "base";
  const gemma = phone ? ["gemma3-270m"] : ["gemma3-1b", "gemma3-270m"];
  return { phone, speech, gemma, defaultGemma: gemma[0] };
}

export function deviceFacts(nav = globalThis.navigator || {}) {
  return { ua: nav.userAgent || "", maxTouchPoints: nav.maxTouchPoints || 0, deviceMemoryGb: nav.deviceMemory ?? null };
}

/**
 * What a download costs on this connection, where the browser says (Chrome only).
 * metered is true on mobile data or with Data Saver on.
 */
export function downloadAdvice(bytes, connection = globalThis.navigator?.connection) {
  const cellular = connection?.type === "cellular";
  const saveData = !!connection?.saveData;
  const mbps = Number(connection?.downlink) > 0 ? Number(connection.downlink) : null;
  return { bytes, metered: cellular || saveData, cellular, saveData, estSec: mbps ? Math.round((bytes * 8) / (mbps * 1e6)) : null };
}

/** Ask the browser not to clear stored stories and models (Safari can, after 7 days unused). */
export async function keepStored() {
  try {
    if (await navigator.storage?.persisted?.()) return true;
    return !!(await navigator.storage?.persist?.());
  } catch {
    return false;
  }
}

export async function storageEstimate() {
  try {
    return await navigator.storage.estimate();
  } catch {
    return null;
  }
}
