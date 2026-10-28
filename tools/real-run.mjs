// Put one recording through the built app with the real models (Whisper, then Gemma on the
// device), the way a family would: new session, a written consent note, "Add a recording you
// already have", write it down, check names, make the book.
//
//   node tools/real-run.mjs <audio or video file> <storyteller label> <language chip> <out dir> [shots dir]
//
// Writes transcript.txt, book.txt and timings.json to <out dir>. Screenshots only when a
// shots dir is given. PRIVATE=1: no screenshots at all, and the session (with its audio) is
// deleted from the browser profile at the end. PROFILE sets the browser profile (models are
// cached there between runs); CHROME the browser. Needs `npm run build` first.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [file, label, lang, outdir, shotsArg] = process.argv.slice(2);
const isPrivate = !!process.env.PRIVATE;
const shots = isPrivate ? "" : shotsArg || "";
mkdirSync(outdir, { recursive: true });
const port = 4198;
const base = `http://localhost:${port}/`;
const profile = process.env.PROFILE || path.join(outdir, "profile");
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...a);
const server = spawn(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "preview", "--port", String(port), "--strictPort"], { cwd: root, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 4000));
const ctx = await chromium.launchPersistentContext(profile, {
  headless: true,
  executablePath: process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  colorScheme: "dark",
});
const timings = {};
try {
  const page = ctx.pages()[0] || (await ctx.newPage());
  page.on("pageerror", (e) => log("PAGE ERROR", e.message));
  page.on("dialog", (d) => d.accept());
  const shot = async (n) => shots && page.screenshot({ path: path.join(shots, `${n}.png`) });
  await page.goto(base);
  await page.getByRole("button", { name: "Start a session" }).click();
  await page.getByPlaceholder("Grandma, Baba, Aunty Ngozi").fill(label);
  await page.getByRole("button", { name: lang, exact: true }).click();
  await page.getByRole("button", { name: /Next/ }).click();
  await page.getByRole("button", { name: /passed on/ }).click();
  await page.locator("textarea").fill("Local test of the app. Not shared anywhere.");
  await page.getByRole("button", { name: "Save this note" }).click();
  let tw = Date.now();
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: "Add a recording you already have" }).click()]);
  await chooser.setFiles(file);
  await page.getByText("Recording added").waitFor({ timeout: 900000 });
  timings.addSec = (Date.now() - tw) / 1000;
  log("added in", timings.addSec, "s");
  await shot("r1-session");
  const dl = page.getByRole("button", { name: "Download and write it down" });
  const plain = page.getByRole("button", { name: "Write it down" });
  await dl.or(plain).first().waitFor();
  tw = Date.now();
  if (await dl.isVisible()) await dl.click();
  else await plain.click();
  await page.getByText(/^Writing down/).waitFor({ timeout: 900000 });
  timings.speechReadySec = (Date.now() - tw) / 1000;
  tw = Date.now();
  await page.getByText("Written", { exact: true }).waitFor({ timeout: 3600000 });
  timings.writeSec = (Date.now() - tw) / 1000;
  log("written in", timings.writeSec, "s");
  await page.locator(".item").first().click();
  await page.locator(".lines .line").first().waitFor();
  writeFileSync(path.join(outdir, "transcript.txt"), await page.locator(".lines").innerText());
  await shot("r2-story");
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Make the story book" }).click();
  const names = page.getByRole("button", { name: "The names look right" });
  if (await names.isVisible().catch(() => false)) {
    writeFileSync(path.join(outdir, "names.txt"), await page.locator(".list").innerText());
    await names.click();
  }
  if (process.env.SKIP_BOOK) {
    log("book skipped");
  } else {
    await page.getByRole("radio", { name: /On this device/ }).click();
    // SMALL_GEMMA=1: the 242 MB Gemma 3 270M (the phone model) instead of the 1B
    if (process.env.SMALL_GEMMA) await page.getByRole("button", { name: /Slow computer\?/ }).click();
    tw = Date.now();
    await page.getByRole("button", { name: /make the book/i }).click();
    let last = "";
    const poll = setInterval(async () => {
      try {
        const t = await page.locator(".progress strong").first().innerText({ timeout: 500 });
        if (t !== last) {
          last = t;
          log("progress:", t);
          if (/^Reading part 1/.test(t) && !timings.gemmaReadySec) timings.gemmaReadySec = (Date.now() - tw) / 1000;
        }
      } catch {}
    }, 2000);
    await page.locator("article.page h1").waitFor({ timeout: 7200000 });
    clearInterval(poll);
    timings.bookSec = (Date.now() - tw) / 1000;
    await page.waitForTimeout(1500);
    const leftOut = page.getByText(/^Left out:/);
    if (await leftOut.count()) await leftOut.click();
    writeFileSync(path.join(outdir, "book.txt"), await page.locator("article.page").innerText());
    await shot("r3-book");
    await page.getByRole("button", { name: "Back" }).click();
  }
  if (isPrivate) {
    await page.getByRole("button", { name: "Delete this session" }).click();
    await page.getByRole("heading", { name: "Tell me again." }).waitFor();
    log("private session deleted from the browser");
  }
  writeFileSync(path.join(outdir, "timings.json"), JSON.stringify(timings, null, 2));
  log("done", JSON.stringify(timings));
} finally {
  await ctx.close();
  server.kill();
}
