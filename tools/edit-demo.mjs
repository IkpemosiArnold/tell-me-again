// Cut the raw demo recording into about a minute: real time where it matters, sped up while
// Whisper works, cards that say what was skipped, and the synthetic story's sound under the
// recording part.
//   node tools/edit-demo.mjs <dir with demo.mp4 + timings.json> <story.wav> <cards dir> <out.mp4>
// The cards dir holds card-record.png, card-gemma.png and card-end.png (tools/cards.mjs).
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [dir, wav, cards, out] = process.argv.slice(2);
const raw = JSON.parse(readFileSync(path.join(dir, "timings.json"), "utf8"));
// marks count from the screencast start; the video starts at its first frame
const t = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Math.max(0, v - (raw.videoStart || 0))]));
const src = path.join(dir, "demo.mp4");
const tmp = path.join(dir, "parts");
mkdirSync(tmp, { recursive: true });
const ff = (args) => execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...args], { stdio: "inherit" });
const V = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "30"];
const A = ["-c:a", "aac", "-ar", "44100", "-ac", "1"];
const parts = [];
let n = 0;
const clip = (from, to, speed = 1) => {
  const f = path.join(tmp, `${++n}.mp4`);
  ff(["-ss", String(from), "-to", String(to), "-i", src, "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-vf", `setpts=PTS/${speed}`, ...V, ...A, "-shortest", f]);
  parts.push(f);
};
const card = (png, secs = 3) => {
  const f = path.join(tmp, `${++n}.mp4`);
  ff(["-loop", "1", "-t", String(secs), "-i", png, "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-vf", "scale=780:1688", ...V, ...A, "-shortest", f]);
  parts.push(f);
};
// 1. home, the lamp, who and which language, the consent
clip(t.home, t.consentRecord + 3);
// 2. recording, with the story's own sound (the fake microphone starts with the capture)
card(path.join(cards, "card-record.png"), 2.5);
{
  const f = path.join(tmp, `${++n}.mp4`);
  ff(["-ss", String(t.storyRecord), "-t", "22", "-i", src, "-ss", "0", "-t", "22", "-i", wav, ...V, ...A, "-map", "0:v", "-map", "1:a", f]);
  parts.push(f);
}
// 3. writing it down, sped up to about 6 s, then the transcript
clip(t.finish, t.written, Math.max(1, (t.written - t.finish) / 6));
clip(t.written, t.names);
// 4. "Did they say these names?"
clip(t.names, t.names + 12);
// 5. the Gemma step is a replay: say so
card(path.join(cards, "card-gemma.png"), 3.5);
// 6. the book, and what the checks left out
clip(t.book - 0.3, t.end);
card(path.join(cards, "card-end.png"), 3);
const list = path.join(tmp, "list.txt");
writeFileSync(list, parts.map((p) => `file '${p}'`).join("\n"));
ff(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", out]);
console.log("wrote", out);
