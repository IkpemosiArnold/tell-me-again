// Every model the app can download, with the bytes it fetches, its licence and where it comes
// from. Sizes and SHA-256 come from the Hugging Face API (checked 28 Oct 2026), so the page
// can say how much it is about to download before it starts, and a finished download is
// checked. Nothing here is fetched until the family asks for it. Models come from Hugging
// Face's CDN, never from this site, so the host serves only a few hundred KB.

export const HF = "https://huggingface.co";

export const SPEECH = {
  // phones: all 8-bit, 41 MB. Selects measured it on iPhones (notes/timings.md there).
  tiny: {
    id: "onnx-community/whisper-tiny.en",
    label: "Whisper tiny (English)",
    short: "small speech model",
    licence: "MIT (OpenAI Whisper), ONNX export by onnx-community",
    source: `${HF}/onnx-community/whisper-tiny.en`,
    dtype: { encoder_model: "q8", decoder_model_merged: "q8" },
    files: {
      "onnx/encoder_model_quantized.onnx": { size: 10124993, sha256: "e93ec822f16a8fd264e7de972ad17d615ea7334b75a52d54c50c2e18dd503a25" },
      "onnx/decoder_model_merged_quantized.onnx": { size: 30718858, sha256: "c0592d0749413c960569e1c7fb806b060d5d18f3ebad4a95cbf9a77dc6e9be52" },
    },
    // configs and tokenizer, measured on first load
    extraBytes: 2700000,
  },
  // laptops: full-precision encoder (quantising whisper's encoder costs accuracy) and an
  // 8-bit decoder, 136 MB
  base: {
    id: "onnx-community/whisper-base.en",
    label: "Whisper base (English)",
    short: "speech model",
    licence: "MIT (OpenAI Whisper), ONNX export by onnx-community",
    source: `${HF}/onnx-community/whisper-base.en`,
    dtype: { encoder_model: "fp32", decoder_model_merged: "q8" },
    files: {
      "onnx/encoder_model.onnx": { size: 82468078, sha256: "1cc86302d480b061452d348638064383ab41b6f3333ddd0e423532d14edaf535" },
      "onnx/decoder_model_merged_quantized.onnx": { size: 53692803, sha256: "dd4761a3f7add26afda3512abff4706920404c2517e85a9f2ff090b0c0987909" },
    },
    extraBytes: 4300000,
  },
};

export const GEMMA = {
  // laptops: Gemma 3 1B through llama.cpp in WebAssembly (wllama), JSON forced by a grammar
  "gemma3-1b": {
    id: "unsloth/gemma-3-1b-it-GGUF",
    file: "gemma-3-1b-it-Q4_0.gguf",
    label: "Gemma 3 1B",
    licence: "Gemma Terms of Use",
    source: `${HF}/unsloth/gemma-3-1b-it-GGUF`,
    size: 721918496,
    sha256: "27ee88e03be02e9ba73def9a819d570d8ad73716e50769e87f374ae394b0276e",
    ctx: 4096,
    passageWords: 450,
  },
  // phones: the smallest Gemma, 242 MB. Under the size where iPhone tabs start to crash.
  "gemma3-270m": {
    id: "unsloth/gemma-3-270m-it-GGUF",
    file: "gemma-3-270m-it-Q4_0.gguf",
    label: "Gemma 3 270M",
    licence: "Gemma Terms of Use",
    source: `${HF}/unsloth/gemma-3-270m-it-GGUF`,
    size: 241574944,
    sha256: "e479ea2962bdcdc7e6321b91148b9ac2f516f649e0921412561d4936aadef158",
    ctx: 2048,
    passageWords: 250,
  },
};

export const gemmaUrl = (m) => `${HF}/${m.id}/resolve/main/${m.file}`;

/** Gemma on Google's Gemini API, opt-in, text only, with the family's own free key. */
export const CLOUD_MODELS = ["gemma-4-26b-a4b-it", "gemma-4-31b-it"];

export const speechBytes = (m) => Object.values(m.files).reduce((a, f) => a + f.size, 0) + (m.extraBytes || 0);

export const mb = (bytes) => `${Math.max(1, Math.round(bytes / 1e6))} MB`;
