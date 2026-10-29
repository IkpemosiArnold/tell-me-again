// Record the demo: a phone-size screen recording of the whole flow, with the synthetic story
// (docs/demo/demo-story.m4a, converted to WAV) as the microphone.
//
//   node tools/demo-video.mjs <story.wav> <out dir> [profile dir]
//
// Whisper runs for real. The story book step replays the answer Gemma 3 1B really gave for
// this story on a 2017 laptop (docs/screens/gemma-3-1b-answer.json), because the real call
// took 17 minutes, with the family's name fixes applied to it (a real run would read the
// fixed transcript); the app's checks then run on that answer live. Needs `npm run build`
// first and Google Chrome (CHROME to point at another Chromium).
// Output: demo.mp4 (no sound), timings.json (marks in seconds from the video's start),
// after-book.png (whole page) and after-book-left-out.png.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { startScreencast, toVideo } from "./screencast.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [wav, out, profileArg] = process.argv.slice(2);
if (!wav || !out) throw new Error("usage: node tools/demo-video.mjs <story.wav> <out dir> [profile dir]");
mkdirSync(out, { recursive: true });
const profile = profileArg || path.join(out, "profile");
const port = 4197;
const base = `http://localhost:${port}/`;
const server = spawn(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "preview", "--port", String(port), "--strictPort"], { cwd: root, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 4000));
const replay = JSON.parse(readFileSync(path.join(root, "docs/screens/gemma-3-1b-answer.json"), "utf8"));
const ctx = await chromium.launchPersistentContext(profile, {
  headless: true,
  executablePath: process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  colorScheme: "dark",
  permissions: ["microphone"],
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${wav}%noloop`],
});
const marks = {};
let t0 = Date.now();
const mark = (k) => (marks[k] = +((Date.now() - t0) / 1000).toFixed(2));
try {
  await ctx.addInitScript((r) => {
    globalThis.__tellMeAgainTest = {
      backend: {
        id: "replay",
        model: "gemma-3-1b-it-Q4_0",
        where: "device",
        loaded: true,
        passageWords: 450,
        // the real Gemma 3 1B run this answer comes from took 17 minutes
        replaySeconds: 17 * 60,
        async load() {},
        async unload() {},
        async run(messages, schema) {
          await new Promise((res) => setTimeout(res, 1500));
          // the family's name fixes, applied to the replayed answer as whole words
          let text = JSON.stringify(schema.required.includes("retelling") ? r.passage : r.book);
          for (const [heard, said] of globalThis.__demoFixes || []) {
            const esc = heard.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            text = text.replace(new RegExp(`(?<![\\p{L}])${esc}(?![\\p{L}])`, "giu"), said);
          }
          return text;
        },
      },
    };
  }, replay);
  const page = ctx.pages()[0] || (await ctx.newPage());
  page.on("pageerror", (e) => console.log("PAGE ERROR", e.message));
  const slow = (ms = 900) => page.waitForTimeout(ms);
  // full-resolution stills for the post (the screencast frames are 1x)
  const still = (name) => page.screenshot({ path: path.join(out, `${name}.png`) });
  const cast = await startScreencast(page, path.join(out, "frames"));
  t0 = cast.t0 * 1000;
  await page.goto(base);
  mark("home");
  await slow(2200);
  await still("01-home");
  await page.locator(".lamp").click();
  await slow(1400);
  await page.getByRole("button", { name: "Start a session" }).click();
  await slow(700);
  await page.getByPlaceholder("Grandma, Baba, Aunty Ngozi").pressSequentially("Mama Efe", { delay: 90 });
  await slow(600);
  await page.getByRole("button", { name: "Yorùbá" }).click();
  await slow(1800);
  await still("02-who-yoruba");
  await page.getByRole("button", { name: "English" }).click();
  await slow(900);
  await page.getByRole("button", { name: /Next/ }).click();
  await slow(2000);
  mark("consent");
  await still("03-consent");
  await page.getByRole("button", { name: "Record their yes" }).click();
  mark("consentRecord");
  await slow(3500);
  await page.getByRole("button", { name: "Done" }).click();
  await slow(1500);
  await page.getByRole("button", { name: "Start the first story" }).click();
  await slow(800);
  await page.getByRole("button", { name: "Start recording" }).click();
  mark("storyRecord");
  await slow(12000);
  await still("05-recording");
  await slow(18000);
  await page.getByRole("button", { name: /Need a question/ }).click();
  await slow(70000);
  await page.getByRole("button", { name: "Finish" }).click();
  mark("finish");
  await slow(1200);
  const dl = page.getByRole("button", { name: "Download and write it down" });
  const plain = page.getByRole("button", { name: "Write it down" });
  await dl.or(plain).first().waitFor();
  if (await dl.isVisible()) await dl.click();
  else await plain.click();
  await page.getByText("Written", { exact: true }).waitFor({ timeout: 1200000 });
  mark("written");
  await page.locator(".item").first().click();
  await slow(3000);
  await still("08-story");
  await page.mouse.wheel(0, 300);
  await slow(2000);
  await page.getByRole("button", { name: "Back" }).click();
  await slow(800);
  await page.getByRole("button", { name: "Make the story book" }).click();
  await page.getByRole("heading", { name: "Did they say these names?" }).waitFor();
  mark("names");
  await slow(2500);
  await still("09-names");
  // Fix every name Whisper misheard in the synthetic story (docs/demo/demo-story.txt says
  // what was really said). The first two fixes play at normal speed on camera; the editor
  // speeds up the rest. The same fixes are applied to the replayed Gemma answer, which is
  // what a real run does: the names are fixed before Gemma reads the transcript.
  const FIXES = [
    [/^Worry$/, "Warri"],
    [/^Paparacoro$/, "Papa Okoro"],
    [/^Ogg Market$/, "Ogbe Market"],
    [/^Ogg$/, "Ogbe"],
    [/^Terry$/, "Tari"],
    [/^Marm/, "Mama Efe"],
    [/^Sierra Leer$/, "Surulere"],
  ];
  const applied = [];
  for (const [re, said] of FIXES) {
    const row = page.locator(".item").filter({ has: page.locator(".name", { hasText: re }) }).first();
    if (!(await row.count())) continue;
    const heard = (await row.locator(".name").innerText()).trim();
    const onCamera = applied.length < 2;
    await row.getByRole("button", { name: "Fix" }).click();
    await slow(onCamera ? 600 : 150);
    if (onCamera) await row.getByRole("textbox").pressSequentially(said, { delay: 90 });
    else await row.getByRole("textbox").fill(said);
    await slow(onCamera ? 500 : 100);
    await row.getByRole("button", { name: "Fix it everywhere" }).click();
    applied.push([heard, said]);
    await slow(onCamera ? 1800 : 400);
    if (applied.length === 2) mark("namesTwo");
  }
  mark("namesDone");
  marks.fixes = applied;
  console.log("name fixes:", JSON.stringify(applied));
  await page.evaluate((pairs) => (globalThis.__demoFixes = pairs), applied);
  await page.getByRole("button", { name: "The names look right" }).click();
  await slow(2000);
  await page.getByRole("button", { name: /make the book/i }).click();
  await page.locator("article.page h1").waitFor({ timeout: 60000 });
  mark("book");
  await slow(3000);
  await page.mouse.wheel(0, 500);
  await slow(2500);
  await page.mouse.wheel(0, 600);
  await slow(1500);
  await page.getByText(/^Left out:/).click();
  await slow(1200);
  await page.mouse.wheel(0, 900);
  await slow(3500);
  mark("end");
  const frames = await cast.stop();
  await page.screenshot({ path: path.join(out, "after-book-left-out.png") });
  await page.mouse.wheel(0, -6000);
  await slow(800);
  await page.screenshot({ path: path.join(out, "after-book.png"), fullPage: true });
  marks.videoStart = +(frames[0].t - cast.t0).toFixed(2);
  toVideo(frames, path.join(out, "demo.mp4"), cast.t0 + marks.end);
  writeFileSync(path.join(out, "timings.json"), JSON.stringify(marks, null, 2));
  console.log("done", marks);
} finally {
  await ctx.close();
  server.kill();
}
