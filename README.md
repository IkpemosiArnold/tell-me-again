# Tell Me Again

Record an elder's stories, have the phone write them down, and let an open model turn them into a small family story book: chapters, the people and places mentioned, a timeline, and questions to ask next time. Everything runs in the browser. Nothing leaves the phone unless the family chooses Google for the book, and the page asks first, every session.

It was built for Nigerian families, so it knows that Grandma might tell the story in English, Pidgin, Yorùbá, Igbo or Hausa, and it is honest about which of those a phone can write down today.

Live: https://tellmeagain.onrender.com

## What it does

1. **Consent first.** Each session starts with a short recording of the elder saying yes, in their own words and any language. It is saved with the session. For recordings of someone who has passed on, the family writes who agreed to keep them instead.
2. **Record.** A hurricane lamp glows with the speaker's voice. "Next story" splits the session into stories without stopping. The audio is saved every few seconds, so a dead battery loses at most a few seconds.
3. **Write it down, on the device.** Whisper runs in a Web Worker (transformers.js, ONNX Runtime Web). Each line has its time; tap it to hear that part, tap the text to fix it. A name Whisper keeps mishearing ("Worry" for Warri) is fixed once for the whole session.
   Old videos work too: "Add a recording you already have" keeps only the sound of a phone video (mediabunny copies the audio track without re-encoding), so a 1.2 GB phone video becomes a few megabytes of audio.
4. **Make the story book.** Gemma reads the transcript on the device (Gemma 3 1B on a computer, Gemma 3 270M on a phone, through llama.cpp in WebAssembly). Or, opt-in, Gemma 4 on Google's free Gemini API with the family's own key, text only, with names swapped for stand-ins before sending.
5. **Check the names first.** Before Gemma reads anything, the app lists every name Whisper heard, each with its sentence, and asks "Did they say these names?" Whisper heard Warri as "Worry"; fixing it once fixes every story.
6. **Check what Gemma wrote.** Every person, place, year, quote and question in the book must appear in the transcript, and the notes about people and places can't come from the model's general knowledge: a note about a place is kept only if a sentence naming that place says the same thing, and a moment's year, names and words must be said together. Real Gemma 3 1B put a Warri market in Lagos and called Lagos "a major port city"; both are now left out. Everything removed is listed under "Left out", so the family can see what the model tried to add. The short chapter retellings can't be checked word by word, so the book says they were written by Gemma, and a retelling that mentions a year the recording never says is flagged.
7. **Works offline after one visit.** A service worker keeps the app and its runtimes, and the models stay on the device, so a session in a village with no data still works.
8. **Keep the archive.** One .zip with the consent recording, every story's audio, the transcript, the story book as a self-contained HTML file, and `session.json`, which this app can open again on another device. No account, no cloud copy.

## How well it writes each language (honestly)

Checked on 28 Oct 2026. WER is the share of words a model gets wrong. Details and sources: [docs/ASR-FINDINGS.md](docs/ASR-FINDINGS.md).

| Language | On the device today | Why |
|---|---|---|
| English (Nigerian accent) | Useful draft | Stock Whisper small: about 33% WER on Nigerian-accented English (AfriSpeech-200). The phone runs a smaller Whisper. |
| Nigerian Pidgin | Rough draft | No browser-sized Pidgin model yet; the English model is used and turns Pidgin into English words. |
| Yorùbá | You type it | Stock Whisper gets about 100% WER on Yorùbá (FLEURS). Better fine-tunes exist but none is packaged for browsers yet. |
| Igbo | You type it | Whisper has no Igbo. The best small fine-tune reports about 42% WER and is not packaged for browsers yet. |
| Hausa | You type it | Stock Whisper gets about 90% WER on Hausa (FLEURS). |

For Yorùbá, Igbo and Hausa the audio is still recorded and kept, and the family types what was said (or a summary in English), which the story book is then made from.

## What leaves the device

| What | Where it goes |
|---|---|
| Audio, consent, transcripts, the book | Nowhere. IndexedDB in this browser, and the .zip the family saves. |
| Model files | Downloaded once from Hugging Face, kept in the browser (OPFS), checked against their SHA-256. |
| WebAssembly runtimes | Downloaded from jsDelivr (ONNX Runtime, llama.cpp via wllama). |
| Transcript text | Only if the family picks "With Google" for the book, ticks "Send this session's text to Google, this time only", and pastes their own free key. The key lives in the tab's memory and is gone when the tab closes. |

Google's free tier may keep that text and have people read it to improve its products (Gemini API terms, April 2026). The page says this before anything is sent.

## Models

| Model | Used for | Download | Licence |
|---|---|---|---|
| [onnx-community/whisper-base.en](https://huggingface.co/onnx-community/whisper-base.en) | writing it down on a computer | 136 MB (fp32 encoder, 8-bit decoder) | MIT |
| [onnx-community/whisper-tiny.en](https://huggingface.co/onnx-community/whisper-tiny.en) | writing it down on a phone | 41 MB (8-bit) | MIT |
| [unsloth/gemma-3-1b-it-GGUF](https://huggingface.co/unsloth/gemma-3-1b-it-GGUF) Q4_0 | the story book on a computer | 722 MB | Gemma Terms of Use |
| [unsloth/gemma-3-270m-it-GGUF](https://huggingface.co/unsloth/gemma-3-270m-it-GGUF) Q4_0 | the story book on a phone | 242 MB | Gemma Terms of Use |
| Gemma 4 26B A4B on the Gemini API | the story book, opt-in | none | Apache 2.0 weights; Google's API terms |

Phones never get the 722 MB model: iOS closes a tab's process well before the phone runs out of memory, and a 722 MB model crashed an iPhone tab in Selects. Downloads are resumable (byte ranges kept as they arrive), so a dropped connection carries on instead of starting again, and the page shows megabytes, a rough naira cost of the data, and a Stop button.

## Measured (28 Oct 2026, 2017 MacBook Pro, Intel i5-7360U, 2 cores, shared with other work)

The test story is a synthetic voice reading a made-up 98-second, 330-word story (`docs/demo/demo-story.txt`).

| Step | Time |
|---|---|
| Download Whisper base (136 MB) | 76 s |
| Whisper base writes down the 98 s story | 63 s (Chrome 156), 77 s (Chromium 136) |
| Download Gemma 3 1B (722 MB) | about 6.5 min |
| Gemma 3 1B makes the book (one passage + title and questions), one thread | 17 min |
| Gemma 4 26B on the Gemini API makes the book, names hidden | 18 to 54 s |

wllama gave llama.cpp one thread on this 2-core laptop (it uses half of `navigator.hardwareConcurrency`, which is 2 here); the app now asks for two. Machines with more cores should be faster; that is not measured yet.

## Run it

```sh
npm ci
npm run dev          # http://localhost:5173
npm test             # unit tests (Node 20+)
npm run build
npm run test:e2e     # the whole flow in Chromium with a synthetic voice as the microphone
```

The end-to-end test needs a Chromium that Playwright can drive (`npx playwright-core install chromium`, or set `CHROME_PATH`). It downloads Whisper tiny (41 MB) once into `E2E_PROFILE_DIR`. Gemma is replaced by a stand-in that invents an uncle and a year, and the test checks that the book leaves both out.

The sample voice is macOS's synthetic "Daniel" reading a made-up story (`test/fixtures/synthetic-story.txt`). No real person's voice or story is in this repository.

## Deploy

`render.yaml` describes one free Render static site: no instance hours, never sleeps. It sends COOP and COEP headers so the WebAssembly runtimes can use threads, and it serves only the app itself (about 250 KB on a first visit). Models and runtimes come from Hugging Face and jsDelivr, so the site uses almost none of the workspace's monthly bandwidth.

## Credits

- The resumable downloader, the Whisper worker's model loading and the load-error wording are adapted from [Selects](https://github.com/IkpemosiArnold/selects) (MIT), by the same author.
- [transformers.js](https://github.com/huggingface/transformers.js) and ONNX Runtime Web run Whisper. [wllama](https://github.com/ngxson/wllama) runs llama.cpp in the browser.
- [Literata](https://github.com/googlefonts/literata) (SIL Open Font License) is the typeface. It covers Yorùbá, Igbo and Hausa letters.

Built for the DEV Hacktoberfest 2026 Open Source AI Challenge, week 4, "Ghost in the Machine" (26 to 31 Oct 2026). Any commit after 31 Oct 2026, 11:59 PM PDT will be listed here.

## Licence

MIT. See [LICENSE](LICENSE).
