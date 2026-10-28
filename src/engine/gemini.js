// Gemma on Google's Gemini API, called straight from the browser with the family's own free
// AI Studio key. Only text goes: the transcript passage and the instructions. Never audio.
// Adapted from Selects (github.com/IkpemosiArnold/selects, MIT), src/core/gemini.mjs.
//
// Gemma on the API has not supported every Gemini feature on every model (JSON mode, system
// instructions, thinking settings), so a request refused for a feature is sent once more
// without it.

export const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

/** JSON Schema -> the OpenAPI subset the Gemini API takes. */
export function toGeminiSchema(s) {
  if (!s || typeof s !== "object") return s;
  const out = {};
  if (s.type) out.type = String(s.type).toUpperCase();
  if (s.properties) {
    out.properties = Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, toGeminiSchema(v)]));
    out.propertyOrdering = Object.keys(s.properties);
  }
  if (s.required) out.required = s.required;
  if (s.items) out.items = toGeminiSchema(s.items);
  if (s.minItems != null) out.minItems = String(s.minItems);
  if (s.maxItems != null) out.maxItems = String(s.maxItems);
  return out;
}

export function geminiBody(messages, { schema, maxTokens = 800, temperature = 0.3, features = {} } = {}) {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  let user = messages.filter((m) => m.role !== "system").map((m) => m.content).join("\n\n");
  if (features.json === false && schema) user += `\n\nAnswer with JSON only, in this shape: ${JSON.stringify(schema)}`;
  const useSystem = features.system !== false && !!system;
  const body = {
    contents: [{ role: "user", parts: [{ text: useSystem || !system ? user : `${system}\n\n${user}` }] }],
    generationConfig: { temperature, maxOutputTokens: maxTokens },
  };
  if (useSystem) body.systemInstruction = { parts: [{ text: system }] };
  if (features.json !== false && schema) {
    body.generationConfig.responseMimeType = "application/json";
    body.generationConfig.responseSchema = toGeminiSchema(schema);
  }
  if (features.thinking !== false) body.generationConfig.thinkingConfig = { thinkingLevel: "minimal" };
  return body;
}

export function readGemini(json) {
  const parts = json?.candidates?.[0]?.content?.parts || [];
  return parts.filter((p) => !p.thought && typeof p.text === "string").map((p) => p.text).join("");
}

export function refusedFeature(message) {
  const m = String(message || "").toLowerCase();
  if (/json mode|response_?mime|response_?schema|responseschema|responsemimetype/.test(m)) return "json";
  if (/system.?instruction|developer instruction/.test(m)) return "system";
  if (/thinking/.test(m)) return "thinking";
  return null;
}

/** Plain words for an API failure. */
export function explainGeminiError(status, message = "") {
  if (status === 400 && /api key|api_key/i.test(message)) return { message: "Google did not accept that key.", hint: "Copy the key again from aistudio.google.com/apikey. New keys must be restricted to the Gemini API." };
  if (status === 401 || status === 403) return { message: "Google did not accept that key.", hint: "Check the key in AI Studio. It must be allowed to use the Gemini API." };
  if (status === 429) return { message: "Google's free limit is used up for now.", hint: "Wait a minute and try again, or make the book on this device instead." };
  if (status === 0) return { message: "Could not reach Google.", hint: "Check the connection and try again." };
  return { message: `Google answered with an error (${status}).`, hint: message.slice(0, 160) || "Try again in a minute." };
}

export async function geminiGenerate({ key, model, messages, schema, maxTokens, temperature, fetchImpl = globalThis.fetch, timeoutMs = 90000, base = GEMINI_BASE, signal }) {
  let timeouts = 0;
  const feats = {};
  for (let tries = 0; tries < 5; tries++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    const stop = () => ctl.abort();
    signal?.addEventListener?.("abort", stop, { once: true });
    let res;
    let text = "";
    try {
      res = await fetchImpl(`${base}/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(geminiBody(messages, { schema, maxTokens, temperature, features: feats })),
        signal: ctl.signal,
        credentials: "omit",
      });
      text = await res.text();
    } catch (e) {
      if (signal?.aborted) throw Object.assign(new Error("Stopped."), { name: "AbortError" });
      // the free tier sometimes takes minutes: one more try, then say so plainly
      if (ctl.signal.aborted) {
        if (++timeouts < 2) continue;
        throw Object.assign(new Error("Google's free Gemma did not answer in time."), { status: 0, hint: "It is busy. Try again in a few minutes, or make the book on this device." });
      }
      const ex = explainGeminiError(0);
      throw Object.assign(new Error(ex.message), { status: 0, hint: ex.hint, cause: e });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", stop);
    }
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}
    if (res.ok) return readGemini(json);
    const message = json?.error?.message || text.slice(0, 200);
    const feature = res.status === 400 ? refusedFeature(message) : null;
    if (feature && feats[feature] !== false) {
      feats[feature] = false;
      continue;
    }
    if (res.status >= 500 && tries === 0) {
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    const ex = explainGeminiError(res.status, message);
    throw Object.assign(new Error(ex.message), { status: res.status, hint: ex.hint });
  }
  throw new Error("Google kept refusing the request.");
}
