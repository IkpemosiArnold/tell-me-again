// Record a page with the Chrome DevTools screencast (Playwright's own video needs an ffmpeg
// build it does not ship for macOS 13). Frames are saved as JPEGs with their timestamps, and
// toVideo() turns them into an mp4, holding each frame until the next one.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export async function startScreencast(page, dir) {
  mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on("Page.screencastFrame", async (f) => {
    const name = path.join(dir, `f${String(frames.length).padStart(6, "0")}.jpg`);
    writeFileSync(name, Buffer.from(f.data, "base64"));
    frames.push({ name, t: f.metadata.timestamp });
    try {
      await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId });
    } catch {}
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 85, maxWidth: 780, maxHeight: 1688, everyNthFrame: 1 });
  const t0 = Date.now() / 1000;
  return {
    t0,
    async stop() {
      try {
        await cdp.send("Page.stopScreencast");
      } catch {}
      return frames;
    },
  };
}

/** frames: [{ name, t }] with t in seconds on any clock; endT on the same clock. */
export function toVideo(frames, out, endT) {
  const list = `${out}.txt`;
  const lines = [];
  frames.forEach((f, i) => {
    const next = i + 1 < frames.length ? frames[i + 1].t : endT;
    lines.push(`file '${f.name}'`, `duration ${Math.max(0.02, next - f.t).toFixed(3)}`);
  });
  lines.push(`file '${frames[frames.length - 1].name}'`);
  writeFileSync(list, lines.join("\n"));
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-vf", "scale=780:1688:force_original_aspect_ratio=decrease,pad=780:1688:(ow-iw)/2:(oh-ih)/2:color=0x12162b,fps=30,format=yuv420p", "-c:v", "libx264", out], { stdio: "inherit" });
}
