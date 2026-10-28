// Multithreaded WebAssembly (ONNX Runtime, llama.cpp) needs cross-origin isolation, so the
// dev and preview servers send the same two headers the host sends (render.yaml).
import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

const isolation = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

// ONNX Runtime's 27 MB WebAssembly is loaded from jsDelivr (asr.worker.js), never from this
// site: the Render workspace has 5 GB of bandwidth a month for every service. Vite still
// copies the file into the build because onnxruntime-web points at it, so it is dropped
// here. If anything ever asked for it, it would fail instead of eating the bandwidth.
const noBundledWasm = {
  name: "no-bundled-wasm",
  generateBundle(_, bundle) {
    for (const name of Object.keys(bundle)) if (name.endsWith(".wasm")) delete bundle[name];
  },
};

export default defineConfig({
  plugins: [preact(), noBundledWasm],
  build: { target: "es2022", assetsInlineLimit: 0, chunkSizeWarningLimit: 2000 },
  worker: { format: "es" },
  server: { headers: isolation, host: true },
  preview: { headers: isolation, host: true },
  optimizeDeps: { exclude: ["@huggingface/transformers", "@wllama/wllama"] },
});
