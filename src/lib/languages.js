// The languages an elder can speak, and what this app can honestly do with each one on the
// device today. The accuracy notes come from published word error rates (WER: the share of
// words a model gets wrong), checked on 28 Oct 2026. Sources are in docs/ASR-FINDINGS.md.
//
// level: how much of the transcript to trust
//   "good"   most words right; still read it over
//   "fair"   a useful draft; expect wrong names and some wrong words
//   "rough"  a rough draft at best; check every line against the audio
//   "none"   no model on a phone or laptop writes this language well enough yet; the audio
//            is kept, and the family types or summarises it themselves

export const LANGUAGES = [
  {
    id: "en",
    name: "English",
    native: "English",
    asr: "whisper-en",
    level: "fair",
    note: "A useful draft. Nigerian names and places often come out wrong, so read it over.",
    why: "Stock Whisper small got about 1 word in 3 wrong on Nigerian-accented English (AfriSpeech-200, 33% WER). The smaller models this app runs on a phone do no better.",
  },
  {
    id: "pcm",
    name: "Pidgin",
    native: "Naijá",
    asr: "whisper-en",
    level: "rough",
    note: "A rough draft. The model hears Pidgin as English and often turns it into English words.",
    why: "No browser-sized Pidgin model exists yet. English Whisper is used instead; a larger Whisper got about 2 words in 3 wrong on a Pidgin test set (68% WER).",
  },
  {
    id: "yo",
    name: "Yoruba",
    native: "Yorùbá",
    asr: null,
    level: "none",
    note: "The audio is kept. No on-device model writes Yorùbá well enough yet, so you type it or a summary.",
    why: "Stock Whisper gets more words wrong than right on Yorùbá (about 100% WER on FLEURS). Better fine-tuned models exist, but none is packaged for browsers yet.",
  },
  {
    id: "ig",
    name: "Igbo",
    native: "Igbo",
    asr: null,
    level: "none",
    note: "The audio is kept. No on-device model writes Igbo well enough yet, so you type it or a summary.",
    why: "Whisper has no Igbo at all. The best small fine-tune reports about 42% WER on FLEURS and is not packaged for browsers yet.",
  },
  {
    id: "ha",
    name: "Hausa",
    native: "Hausa",
    asr: null,
    level: "none",
    note: "The audio is kept. No on-device model writes Hausa well enough yet, so you type it or a summary.",
    why: "Stock Whisper gets about 9 in 10 Hausa words wrong (FLEURS). Good Hausa fine-tunes exist but are not packaged for browsers yet.",
  },
];

export const LEVEL_LABEL = {
  good: "Writes it well",
  fair: "Useful draft",
  rough: "Rough draft",
  none: "You type it",
};

export function language(id) {
  return LANGUAGES.find((l) => l.id === id) || null;
}

/** True when the device can write this language down by itself. */
export function canTranscribe(id) {
  return !!language(id)?.asr;
}

/**
 * The plan for a recording in language `id`: { transcribe, level, label, note }.
 * A mix of languages is transcribed with the English model and marked rough.
 */
export function planFor(id) {
  if (id === "mix") {
    return { transcribe: true, asr: "whisper-en", level: "rough", label: LEVEL_LABEL.rough, note: "Mixed speech is written with the English model. Parts in Yorùbá, Igbo or Hausa will come out wrong." };
  }
  const l = language(id);
  if (!l) return { transcribe: false, asr: null, level: "none", label: LEVEL_LABEL.none, note: "Unknown language." };
  return { transcribe: !!l.asr, asr: l.asr, level: l.level, label: LEVEL_LABEL[l.level], note: l.note };
}
