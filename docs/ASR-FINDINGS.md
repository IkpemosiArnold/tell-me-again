# On-device speech-to-text for Nigerian languages (checked 28 Oct 2026)

The question: which open speech models can write down English, Pidgin, Yorùbá, Igbo and Hausa inside a browser tab, on a phone, today? The short answer: only stock Whisper is packaged for browsers (transformers.js), and stock Whisper is only usable for English. Better Nigerian fine-tunes exist, but each one would need an ONNX export first and most are too big for an iPhone tab.

WER is word error rate: the share of words a model gets wrong. Over 100% means it wrote more wrong words than the speaker said.

## What ships

| Language | Model in the app | Download | Label in the app |
|---|---|---|---|
| English (Nigerian accent) | whisper-base.en (computer), whisper-tiny.en (phone) | 136 MB / 41 MB | Useful draft |
| Nigerian Pidgin | the same English model | same | Rough draft |
| Yorùbá | none: the audio is kept, the family types | | You type it |
| Igbo | none | | You type it |
| Hausa | none | | You type it |

## The numbers behind the labels

| Language | Model | Reported accuracy | Source |
|---|---|---|---|
| Nigerian English | Whisper small (stock) | 37.7% raw, 33.1% normalised WER, 1,185 AfriSpeech-200 test clips | DivineAngel317/whisper-small-nigerian-accented-english model card (2026-10-01) |
| Nigerian English | DivineAngel317/whisper-small-nigerian-accented-english | 20.7% WER, same set; CC-BY-NC-SA; no ONNX | same card |
| Nigerian English | rishabbahal/whisper-small-nigerian-accent | 48.8% WER (worse than stock); no ONNX | model card (2024-10-02) |
| Pidgin | Whisper medium, zero-shot | 68.0% WER | Mansa-Labs/obum-whisper-medium-nigerian-pidgin card (2026-06-28) |
| Pidgin | asr-nigerian-pidgin/pidgin-wav2vec2-xlsr53 | 29.6% WER on its own test set; Apache-2.0; about 320 MB at 8-bit if exported | model card (2025-08-18) |
| Yorùbá | Whisper tiny / base / small / large-v2 (stock) | 106.4 / 101.8 / 116.4 / 94.8 WER on FLEURS | Whisper paper, Table 13 |
| Yorùbá | LyngualLabs/whisper-small-yoruba | 20.76% WER on its own code-switched test set (not FLEURS); Apache-2.0 | model card (2026-02-01) |
| Igbo | Whisper | no Igbo language token at all | openai/whisper tokenizer.py |
| Igbo | theelvace/whisper-small-igbo-25k | 41.95% WER on FLEURS Igbo; CC-BY-NC-SA | model card (2026-06-29) |
| Hausa | Whisper tiny / base / small / large-v2 (stock) | 100.2 / 98.6 / 90.1 / 88.9 WER on FLEURS | Whisper paper, Table 13 |
| Hausa | CLEAR-Global/whisper-small-clearglobal-hausa-asr-1.0.0 | 2.23% WER in-domain (TWB Voice); other test sets pending; CC-BY-SA-4.0 | model card (2025-07-14) |
| Hausa | EYEDOL/whisper-base-hausa | 50.6% WER on a NaijaVoices split; Apache-2.0 | model card |
| All five | facebook/mms-1b-all + language adapters | FLEURS WER: Hausa 25.5, Igbo 44.6, Yorùbá 53.6 (SBPN paper); about 970 MB per language at 8-bit; CC-BY-NC-4.0 | arxiv 2605.17710 |
| All five | Omnilingual ASR CTC 300M v2 | per-language accuracy for the 300M model not published; 328 MB int8 (sherpa layout) | facebookresearch/omnilingual-asr |

## Why none of the better models ship yet

- **Format.** transformers.js loads ONNX files in its own layout. The Yorùbá and Igbo ONNX files that exist are in sherpa-onnx or a custom Android layout. Every other fine-tune is PyTorch only.
- **Size.** A whisper-small export is about 250 MB at 8-bit, which is at the edge of what an iPhone tab survives (WebKit bug 269777 found about 1 GB of WebAssembly memory on a first load and 300 to 500 MB after a reload). MMS is about 970 MB per language.
- **Licences.** Several of the best are non-commercial or share-alike, which needs care before bundling.

## Next step (after the challenge)

Export `LyngualLabs/whisper-small-yoruba` and `EYEDOL/whisper-base-hausa` (both Apache-2.0) with Optimum to the transformers.js layout, test them on FLEURS samples, publish the exports on Hugging Face, and offer them as "Experimental" with their measured WER. Igbo waits for a permissively licensed fine-tune.

## Phones

- Safari 26 shipped WebGPU on iOS 26 (WebKit blog, 2025-09-15). This app runs Whisper on the CPU (WebAssembly) everywhere, which is the path Selects tested on iPhones.
- In Nigeria, Android was 84.2% of mobile web traffic in September 2026 (StatCounter), so most of the families this is for are on Android phones.

## What we saw ourselves (28 Oct 2026)

On a synthetic voice (macOS "Daniel", a British English voice) reading a made-up 98-second story full of Nigerian names (`docs/demo/demo-story.txt`), Whisper base got the ordinary English almost word for word and most of the names wrong:

| Said | Whisper base wrote |
|---|---|
| Mama Efe | Marmauve |
| Warri | Worry |
| Papa Okoro | Paparacoro |
| Ogbe market | Ogg market |
| Tari | Terry |
| Benin City | Ben and City |
| Surulere | Sierra Leer |
| money no dey (Pidgin) | money no day |

A synthetic British voice is not a Nigerian speaker, so this says nothing about accent. It does show the pattern the app is built around: names Whisper has never heard come out as English words it has. That is why the app asks "Did they say these names?" before the story book, and why a fix applies to every story at once. The full transcript is in `docs/screens/demo-transcript-whisper-base.txt`.
