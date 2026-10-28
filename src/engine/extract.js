// Keeping only the sound of a video the family already has. A phone video of Grandma from
// last Christmas is mostly picture: a 3-minute iPhone video is over 1 GB, and reading it whole
// would crash a phone tab. mediabunny reads the file in pieces (WebCodecs, nothing uploaded)
// and copies the audio track into a small .m4a without re-encoding it, so the sound is
// exactly what was recorded, at a fraction of the size.
import { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output, WebMOutputFormat } from "mediabunny";

/** True when a file is worth extracting (a video, or audio in a video container). */
export function isVideoLike(file) {
  return /^video\//.test(file.type || "") || /\.(mov|mp4|m4v|3gp|webm|mkv)$/i.test(file.name || "");
}

/** Resolves { blob, mime, seconds } with only the audio. onProgress(0..1). */
export async function extractAudio(file, { onProgress } = {}) {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) throw Object.assign(new Error("This video has no sound to keep."), { hint: "Choose a video where someone is speaking." });
    const seconds = await input.computeDuration();
    const codec = await track.getCodec();
    // Opus and Vorbis sound goes in WebM; AAC and the rest in .m4a
    const webm = codec === "opus" || codec === "vorbis";
    const output = new Output({ format: webm ? new WebMOutputFormat() : new Mp4OutputFormat(), target: new BufferTarget() });
    const conversion = await Conversion.init({ input, output, video: { discard: true }, showWarnings: false });
    if (!conversion.isValid) throw Object.assign(new Error("This browser cannot read the sound in that video."), { hint: "Try Chrome or Safari, or share the video as an audio file." });
    conversion.onProgress = (p) => onProgress?.(p);
    await conversion.execute();
    const mime = webm ? "audio/webm" : "audio/mp4";
    return { blob: new Blob([output.target.buffer], { type: mime }), mime, seconds };
  } finally {
    input.dispose?.();
  }
}
