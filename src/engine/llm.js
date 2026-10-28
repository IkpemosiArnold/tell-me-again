// Where Gemma runs for the story book. Every backend has the same shape:
//   { id, label, model, where: "device" | "google", bytes, load({ onProgress }), run(messages, schema, maxTokens) -> text, unload() }
//
// On this device (the default; nothing leaves it):
//   Gemma 3 1B (722 MB) on laptops, Gemma 3 270M (242 MB) on phones, through llama.cpp
//   compiled to WebAssembly (wllama). The answer is forced into the JSON shape by a grammar.
// With Google (opt-in, once per session, text only):
//   Gemma 4 on the Gemini API with the family's own free key.
import { GEMMA, gemmaUrl } from "./models.js";
import { opfsStore, memoryStore, resumableDownload } from "./download.js";
import { keepStored } from "./devices.js";
import { geminiGenerate } from "./gemini.js";
import { hideNames, restoreNames } from "../lib/redact.js";

// llama.cpp's WebAssembly comes from jsDelivr, pinned to the installed wllama version, so this
// site serves only its own few hundred KB. Safari (no JSPI or memory64) gets wllama's compat
// build, which wllama itself fetches from jsDelivr.
const WLLAMA_VERSION = "3.8.1";
const WLLAMA_WASM = `https://cdn.jsdelivr.net/npm/@wllama/wllama@${WLLAMA_VERSION}/esm/wasm/wllama.wasm`;

let modelStoreP = null;
const modelStore = () => (modelStoreP ??= opfsStore("models").then((s) => s || memoryStore()));

/** True when the whole model file is already on this device. */
export async function gemmaIsCached(key) {
  const m = GEMMA[key];
  const s = await modelStore();
  const { bytes, meta } = await s.info(gemmaUrl(m));
  return !!(meta?.done && meta.size === bytes);
}

export async function forgetGemma(key) {
  const s = await modelStore();
  await s.reset(gemmaUrl(GEMMA[key]));
}

export function wllamaBackend(key = "gemma3-1b") {
  const m = GEMMA[key];
  let w = null;
  return {
    id: key,
    label: `${m.label}, on this device`,
    model: m.file.replace(/\.gguf$/, ""),
    where: "device",
    bytes: m.size,
    passageWords: m.passageWords,
    get loaded() {
      return !!w;
    },
    async load({ onProgress, signal } = {}) {
      if (w) return;
      const store = await modelStore();
      const blob = await resumableDownload(gemmaUrl(m), {
        store,
        signal,
        expect: { size: m.size, sha256: m.sha256 },
        onProgress: ({ loaded, total }) => onProgress?.({ loaded, total: total || m.size }),
      });
      keepStored();
      const { Wllama } = await import("@wllama/wllama");
      w = new Wllama({ default: WLLAMA_WASM }, { allowOffline: true, suppressNativeLog: true });
      w.setCompat?.("default");
      await w.loadModel([blob], { n_ctx: m.ctx, n_batch: 512, n_gpu_layers: 0 });
    },
    async run(messages, schema, maxTokens = 600) {
      const res = await w.createChatCompletion({
        messages,
        max_tokens: maxTokens,
        temperature: 0.3,
        response_format: { type: "json_schema", json_schema: { name: "answer", schema } },
      });
      return res.choices?.[0]?.message?.content ?? "";
    },
    async unload() {
      await w?.exit?.();
      w = null;
    },
  };
}

/**
 * Gemma 4 through the Gemini API. hide: swap names for stand-ins before sending and back
 * after (redact.js). Each call sends one passage of text.
 */
export function geminiBackend({ key, model = "gemma-4-26b-a4b-it", hide = true, elderName = "", onSend } = {}) {
  return {
    id: "gemini",
    label: `Gemma 4 with Google (${model})`,
    model,
    where: "google",
    bytes: 0,
    passageWords: 1500,
    loaded: true,
    async load() {},
    async run(messages, schema, maxTokens = 800) {
      let map = [];
      let send = messages;
      if (hide) {
        // the same stand-ins across the system and user messages of one call
        const joined = messages.map((x) => x.content).join("\n\u0000\n");
        const h = hideNames(joined, { extra: [elderName] });
        map = h.map;
        const back = h.text.split("\n\u0000\n");
        send = messages.map((x, i) => ({ ...x, content: back[i] }));
      }
      onSend?.(send);
      const text = await geminiGenerate({ key, model, messages: send, schema, maxTokens: Math.max(800, maxTokens * 2), temperature: 0.3 });
      return hide ? restoreNames(text, map) : text;
    },
    async unload() {},
  };
}
