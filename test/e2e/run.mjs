// End-to-end: the whole family flow in a real browser, with a generated sample as the
// microphone (a synthetic voice reading a made-up story, test/fixtures/synthetic-story.wav).
//
//   consent -> record a story -> download Whisper tiny -> write it down -> story book -> archive
//
// The speech model is real (41 MB from Hugging Face, kept in E2E_PROFILE_DIR between runs).
// Gemma is replaced by a stand-in that answers like a careless small model would: some
// right names, an invented uncle and an invented year. The test checks that the book keeps
// the right ones and leaves the invented ones out.
//
// Needs a build first (npm run build). Env: CHROME_PATH to use a specific Chromium,
// SHOTS_DIR to save iPhone-size screenshots, HEADED=1 to watch.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { readZip } from "../../src/lib/zip.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const wav = path.join(root, "test/fixtures/synthetic-story.wav");
const port = 4199;
const base = `http://localhost:${port}/`;
const profile = (process.env.E2E_PROFILE_DIR || "").replace(/^~/, homedir()) || mkdtempSync(path.join(tmpdir(), "tma-e2e-"));
mkdirSync(profile, { recursive: true });
const shots = process.env.SHOTS_DIR || "";
if (shots) mkdirSync(shots, { recursive: true });

const log = (...a) => console.log(`[e2e ${new Date().toISOString().slice(11, 19)}]`, ...a);

async function waitForServer(url, ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`The preview server did not start at ${url}`);
}

if (!existsSync(path.join(root, "dist/index.html"))) throw new Error("Run npm run build first.");
const server = spawn(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "preview", "--port", String(port), "--strictPort"], { cwd: root, stdio: "ignore" });
let ctx;
try {
  await waitForServer(base);
  ctx = await chromium.launchPersistentContext(profile, {
    headless: !process.env.HEADED,
    executablePath: process.env.CHROME_PATH || undefined,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: process.env.E2E_SCHEME === "light" ? "light" : "dark",
    acceptDownloads: true,
    permissions: ["microphone"],
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${wav}`, "--autoplay-policy=no-user-gesture-required"],
  });
  const page = ctx.pages()[0] || (await ctx.newPage());
  page.on("pageerror", (e) => log("PAGE ERROR", e.message));
  page.on("console", (m) => m.type() === "error" && log("console error:", m.text().slice(0, 300)));
  await page.addInitScript(() => {
    // the Gemma stand-in: copies the first sentence as the quote, names two real people and
    // one invented one, and dates one moment with a year the story never says
    const passageOf = (messages) => (/"""([\s\S]*?)"""/.exec(messages[1].content) || [])[1] || "";
    globalThis.__tellMeAgainTest = {
      speech: "tiny",
      backend: {
        id: "fake",
        model: "stand-in for Gemma",
        where: "device",
        loaded: true,
        passageWords: 450,
        async load() {},
        async unload() {},
        async run(messages, schema) {
          await new Promise((r) => setTimeout(r, 300));
          if (schema.required.includes("retelling")) {
            const p = passageOf(messages);
            const first = (p.match(/[^.!?]+[.!?]/) || [p])[0].trim();
            // names as Whisper actually wrote them (it may hear "Warri" as "worry")
            const place = (/born in ([\p{L}'-]+)/iu.exec(p) || [])[1];
            const people = [...new Set(p.match(/(?<=[a-z,] )[A-Z][a-z]+/g) || [])].slice(0, 2);
            return JSON.stringify({
              title: "A house with a zinc roof",
              retelling: "She remembered her childhood home and the river.",
              quote: first,
              people: people.map((name) => ({ name, who: "" })).concat([{ name: "Uncle Invented", who: "her uncle" }]),
              places: place ? [{ name: place, note: "where she was born" }] : [],
              moments: [{ when: "1999", what: "Something that never happened" }],
            });
          }
          return JSON.stringify({ title: "The zinc roof that sang", questions: ["What did Papa Okoro catch in the river?", "Who was Tari?", "What was Independence Day like?"] });
        },
      },
    };
  });
  const shot = async (name) => shots && page.screenshot({ path: path.join(shots, `${name}.png`) });

  log("home");
  await page.goto(base);
  await page.getByRole("heading", { name: "Tell me again." }).waitFor();
  await shot("01-home");

  await page.getByRole("button", { name: "Start a session" }).click();
  await page.getByPlaceholder("Grandma, Baba, Aunty Ngozi").fill("Mama Efe");
  await page.getByRole("button", { name: "Yorùbá" }).click();
  await page.getByText("You type it", { exact: true }).waitFor();
  await page.getByRole("button", { name: "English" }).click();
  await page.getByText("Useful draft", { exact: true }).waitFor();
  await shot("02-who");
  await page.getByRole("button", { name: /Next/ }).click();

  log("consent");
  await page.getByText("I am Mama Efe.").waitFor();
  await shot("03-consent");
  await page.getByRole("button", { name: "Record their yes" }).click();
  await page.waitForTimeout(2500);
  await shot("04-consent-recording");
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Start the first story" }).click();

  log("recording the story (34 s)");
  await page.getByRole("button", { name: "Start recording" }).click();
  await page.waitForTimeout(6000);
  await shot("05-recording");
  await page.getByRole("button", { name: /Need a question/ }).click();
  await page.waitForTimeout(28500);
  await page.getByRole("button", { name: "Finish" }).click();

  log("session");
  await page.getByText("To write down").waitFor();
  await shot("06-session");
  const dl = page.getByRole("button", { name: "Download and write it down" });
  const plain = page.getByRole("button", { name: "Write it down" });
  await dl.or(plain).first().waitFor();
  if (await dl.isVisible()) await dl.click();
  else await plain.click();
  await page.waitForTimeout(1500);
  await shot("07-downloading");
  log("writing it down");
  await page.getByText("Written", { exact: true }).waitFor({ timeout: 600000 });

  await page.getByRole("button", { name: /Story 1/ }).click();
  await page.locator(".lines .line").first().waitFor();
  const transcript = (await page.locator(".lines").innerText()).toLowerCase();
  log("transcript:", transcript.replace(/\s+/g, " ").slice(0, 400));
  assert.match(transcript, /born/);
  assert.match(transcript, /1951|nineteen fifty/);
  await shot("08-story");
  await page.getByRole("button", { name: "Back" }).click();

  log("story book");
  await page.getByRole("button", { name: "Make the story book" }).click();
  await shot("09-book-choice");
  await page.getByRole("radio", { name: /With Google/ }).click();
  await page.getByText(/may keep this text/).waitFor();
  assert.equal(await page.getByRole("button", { name: "Make the book" }).isDisabled(), true, "Google needs a key and a yes first");
  await shot("10-book-google");
  await page.getByRole("radio", { name: /On this device/ }).click();
  await page.getByRole("button", { name: /make the book/i }).click();
  await page.getByRole("heading", { name: "The zinc roof that sang" }).waitFor({ timeout: 60000 });
  await page.waitForTimeout(800);
  await shot("11-book");
  const book = await page.locator("article.page").innerText();
  const bornIn = (/born in ([\p{L}'-]+)/iu.exec(transcript) || [])[1];
  assert.ok(bornIn && book.toLowerCase().includes(bornIn), `the birthplace as heard ("${bornIn}") is in the book`);
  const kept = book.split("Left out")[0];
  assert.doesNotMatch(kept, /Uncle Invented|1999/);
  // the synthetic voice says "Tari"; when Whisper writes it another way, a question about Tari is not grounded
  if (!/\btari\b/.test(transcript)) assert.doesNotMatch(kept, /Who was Tari\?/);
  await page.getByText(/^Left out:/).click();
  assert.match(await page.locator("article.page").innerText(), /Uncle Invented/);
  await shot("12-book-left-out");

  log("archive");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Save the family archive" }).click()]);
  assert.equal(download.suggestedFilename(), `Mama Efe - stories - ${new Date().toISOString().slice(0, 10)}.zip`);
  const file = await download.path();
  const { readFile } = await import("node:fs/promises");
  const files = await readZip(new Uint8Array(await readFile(file)));
  const names = Object.keys(files).map((n) => n.split("/").slice(1).join("/"));
  log("archive holds:", names.join(", "));
  for (const want of ["README.txt", "transcript.txt", "story-book.html", "session.json"]) assert.ok(names.includes(want), want);
  assert.ok(names.some((n) => /^consent\/consent\.\w+$/.test(n)), "consent audio");
  assert.ok(names.some((n) => /^audio\/01 - Story 1\.\w+$/.test(n)), "story audio");
  const audio = Object.entries(files).find(([n]) => n.includes("/audio/"))[1];
  assert.ok(audio.length > 50000, `story audio is ${audio.length} bytes`);

  log("reopen the archive on a fresh page");
  await page.goto(base);
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: "Open an archive" }).click()]);
  await chooser.setFiles(file);
  await page.getByRole("heading", { name: "Mama Efe's stories" }).waitFor();
  log("PASS");
} finally {
  await ctx?.close().catch(() => {});
  server.kill();
}
