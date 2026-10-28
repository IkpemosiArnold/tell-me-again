// Title cards for the demo video and the DEV cover image, drawn by Chrome from HTML so they
// use the app's own typeface and colours.  node tools/cards.mjs <out dir>
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = process.argv[2] || path.join(root, "docs/demo");
mkdirSync(out, { recursive: true });
const font = (f) => `file://${root}/node_modules/@fontsource-variable/literata/files/literata-${f}-opsz-normal.woff2`;
const style = `
@font-face{font-family:L;src:url("${font("latin")}")}
@font-face{font-family:L;src:url("${font("latin-ext")}");unicode-range:U+0100-02BA,U+1E00-1E9F,U+20A0-20C0}
@font-face{font-family:L;src:url("${font("vietnamese")}");unicode-range:U+0300-0301,U+0323,U+1EA0-1EF9}
html,body{margin:0;background:#12162b;color:#f4f1ea;font-family:L,Georgia,serif;overflow:hidden}
h1{font-weight:600;letter-spacing:-.01em;margin:0;font-variation-settings:"opsz" 72}
p{color:#c9cce2;margin:0}
b{color:#f5ba45;font-weight:600}`;
const lamp = `<svg viewBox="0 0 120 160" fill="none" stroke="#f4f1ea" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M34 34 C34 6, 86 6, 86 34"/><path d="M38 34 H82 L76 44 H44 Z" fill="#12162b"/><path d="M44 46 C26 62, 26 104, 44 118 H76 C94 104, 94 62, 76 46 Z" fill="#12162b" opacity=".6"/><path d="M60 70 C67 80, 69 88, 66 96 C64 101, 56 101, 54 96 C51 88, 53 80, 60 70 Z" fill="#f5ba45" stroke="none"/><path d="M58 99 V106 M62 99 V106" stroke-width="2"/><path d="M50 46 C42 66, 42 98, 50 118 M70 46 C78 66, 78 98, 70 118" stroke-width="2" opacity=".7"/><path d="M40 118 H80 L88 134 C88 142, 32 142, 32 134 Z" fill="#12162b"/><path d="M30 146 H90"/></svg>`;
const phoneCard = (h, p) => `<style>${style} body{width:390px;height:844px;display:flex;align-items:center} div{padding:0 34px} h1{font-size:31px;line-height:1.2;margin-bottom:16px} p{font-size:19px;line-height:1.5}</style><div><h1>${h}</h1><p>${p}</p></div>`;
const cards = {
  "card-record.png": [390, 844, phoneCard("A made-up Mama Efe, a synthetic voice.", "No real person is in this video. The lamp follows the voice.")],
  "card-gemma.png": [390, 844, phoneCard("Skipping the wait.", "On a 2017 laptop, Gemma 3 1B took <b>17 minutes</b> to read this story. What follows replays its real answer, and the checks run on it live.")],
  "card-end.png": [390, 844, phoneCard("Tell Me Again", "tellmeagain.onrender.com<br>Open source, MIT. Nothing leaves the phone unless you say so.")],
  "cover.png": [
    1000,
    420,
    `<style>${style} body{width:1000px;height:420px} .g{position:absolute;left:30px;top:10px;width:400px;height:400px;border-radius:50%;background:radial-gradient(closest-side,rgba(245,186,69,.42),transparent 72%)} .w{display:flex;align-items:center;gap:56px;height:100%;padding:0 72px} svg{width:190px;height:250px;position:relative} h1{font-size:76px;line-height:1;margin-bottom:18px} p{font-size:26px;line-height:1.4;max-width:560px}</style><div class=g></div><div class=w>${lamp}<div><h1>Tell me again.</h1><p>An elder's stories, written down on the phone and made into a small family book by open Gemma.</p></div></div>`,
  ],
};
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
for (const [name, [w, h, html]] of Object.entries(cards)) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  // from a file, so the page may load the font files next to it on disk
  const file = path.join(tmpdir(), `tma-card-${name}.html`);
  writeFileSync(file, `<!doctype html><meta charset="utf-8">${html}`);
  await page.goto(`file://${file}`, { waitUntil: "load" });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, name) });
  await page.close();
}
await browser.close();
console.log("cards in", out);
