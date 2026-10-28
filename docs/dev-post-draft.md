---
title: Tell Me Again: my phone can't write Yorùbá yet, so it keeps Grandma's voice instead
published: false
tags: devchallenge, hf26challenge, ai, opensource
cover_image: [UPLOAD: docs/screens/cover.png]
---

<!--
DRAFT for Arnold. Not published. No em dashes. Every number below was measured or sourced on
28 to 30 Oct 2026; sources are in docs/ASR-FINDINGS.md and docs/DEPLOY.md.
[ARNOLD: ...] marks a line only you can write. [PENDING: ...] marks a number still being measured.
Nothing about your grandmother is in this draft: not her name, words, voice or face. Add only what
you and she are happy to share.
-->

*This is a submission for the [Hacktoberfest Open-Source AI Challenge Week 4: Ghost in the Machine](https://dev.to/challenges/hacktoberfest-week4-2026-10-26)*

[ARNOLD: two or three sentences about your grandmother's stories. For example, the story you have heard the most times, or the one you only heard once and can't get back. Only what you're happy to share.]

[ARNOLD: optional self-own, keep only if true: "I'm not the grandchild who remembers every story. I'm the one who keeps saying 'tell me again'."]

Most families have a person like that. Many also have a phone full of their voice notes that nobody will ever play again. So for this week's theme, "honour the past", I built the thing I wish we had: a way to sit with an elder for an evening, record the stories properly, and come away with something the cousins will actually read.

## What I Built

**Tell Me Again** records an elder's stories in the browser, writes them down on the phone, and lets Gemma, Google's open model, turn them into a small family story book: chapters, the people and places mentioned, a timeline, and questions to ask next time.

It runs in the browser. There is no account and no server copy. Nothing leaves the phone unless you choose otherwise, and if you do, the page asks you first, every session.

A session goes like this:

1. **Ask first.** Before the first story, you record them saying yes, in their own words and any language. That clip is saved with the stories. For recordings of someone who has already passed on, the family writes down who agreed to keep them instead.
2. **Record.** A kerosene hurricane lamp glows with the speaker's voice. If you grew up with NEPA, you know the lamp. "Next story" starts a new chapter without stopping, and there's a "Need a question?" card for when the conversation stalls.
3. **Write it down.** Whisper runs on the device. Tap any line to fix it, tap its time to hear that part again.
4. **Check the names.** Before the book, the app asks "Did they say these names?" and shows each one with the sentence it was heard in.
5. **Make the book.** Gemma reads the transcript and writes the book on the device, or, if you say so for this session only, with Google's free Gemma API.
6. **Keep it.** One .zip: the consent clip, every recording, the transcript, the story book as a plain HTML file that doesn't need this app to open, and a data file the app can open again on another phone.

[SCREENSHOT: docs/screens/01-home.png and docs/screens/05-recording.png side by side. Caption: "The lamp follows the voice. That is the whole recording screen."]

### The honest part: languages

A lot of Nigerian grandparents tell their best stories in Yorùbá, Igbo, Hausa or Pidgin, or all of them in one sentence. [ARNOLD: optional, which language yours uses, only if you're happy to say.] So the first thing I checked was which Nigerian languages a phone can write down today, using open models that run in a browser tab. The answer surprised me, and not in a good way.

| Language | What the app does | Why |
|---|---|---|
| English (Nigerian accent) | Useful draft | Stock Whisper small gets about 1 word in 3 wrong on Nigerian-accented English (33% WER, AfriSpeech-200). |
| Pidgin | Rough draft | No browser-sized Pidgin model exists yet. The English model hears Pidgin as English. |
| Yorùbá | You type it | Stock Whisper gets more Yorùbá words wrong than right (about 100% WER on FLEURS). |
| Igbo | You type it | Whisper has no Igbo at all. |
| Hausa | You type it | Stock Whisper gets about 9 in 10 Hausa words wrong (FLEURS). |

Good Yorùbá, Igbo and Hausa models do exist on Hugging Face, fine-tuned by Nigerian and African teams. None of them is packaged to run in a browser yet, and most would not fit in an iPhone tab anyway. So the app doesn't pretend. For those three languages it records and keeps the audio, which is the real treasure, and the grandchild types what was said or a summary in English. The book is made from that.

I would rather ship a label that says "You type it" than a transcript that is confidently wrong about Grandma.

Even in English the names suffer. In my test recording (a synthetic voice reading a made-up story, more on that below), Whisper wrote "I was born in Warri" as "I was born in Worry". Mama Efe became "Marmauve". That is why every transcript line is editable and why the app calls English a "useful draft", not a transcript.

## Demo

**Live:** https://tellmeagain.onrender.com (it works best on Chrome or Safari; the first "write it down" downloads a 41 MB speech model on phones, 136 MB on a computer)

[VIDEO: docs/demo/tell-me-again-demo.mp4, about a minute. A synthetic voice reads a made-up story about a made-up Mama Efe; no real person is in it. Whisper runs live. The story book step replays the answer Gemma 3 1B gave for this story on my laptop (it took 17 minutes, so the video skips the wait, and says so), and the new checks run on it live.]

[SCREENSHOT: docs/screens/after-book.png. Caption: "The story book. Places show the sentence they were heard in, not what the model knows about them."]

## Code

{% github IkpemosiArnold/tell-me-again %}

MIT licensed. `npm ci && npm run dev`, and `npm run test:e2e` runs the whole flow in Chromium with a synthetic voice as the microphone.

## How I Built It

It's a static site: Preact and Vite, no backend. Everything heavy happens in the visitor's browser.

**Writing it down.** Whisper runs in a Web Worker through transformers.js and ONNX Runtime Web. Phones get Whisper tiny (41 MB, all 8-bit), computers get Whisper base (136 MB). Audio is cut into windows of up to 30 seconds at the quietest point near each cut, so no word is split, and lines appear as each window finishes.

**The story book.** Gemma 3 runs through llama.cpp compiled to WebAssembly (wllama): the 1B model (722 MB) on a computer, the 270M model (242 MB) on a phone. The answer is forced into a JSON shape by a grammar, so a small model can't wander off into prose. Small models can't read a long transcript at once, so the work is split: one call per passage of about 450 words (a chapter title, a short retelling, one quote, the people, places and moments in that passage), then one call for the book's title and the questions for next time.

On my 2017 MacBook Pro (2 cores, and busy with other work at the time), Whisper base wrote down the 98-second test story in 63 seconds. Gemma 3 1B took 17 minutes for the whole book, partly because llama.cpp was running on one thread: wllama uses half of the cores the browser reports, and this laptop reports 2. It now asks for two. [PENDING: the time with two threads.] Gemma 4 on Google's API took 18 to 54 seconds. A slow computer can also pick the 242 MB Gemma, which is rougher and quicker.

**The ghost in the machine.** Small models make things up, and in a family archive that is not a quirk. It's a lie about your grandmother that will outlive her. So my first version kept nothing Gemma wrote about a person, place, year or quote unless it appeared in the transcript. A quote had to be word for word, a year had to have been said, and a question for next time couldn't ask about someone the recording never mentions.

Then I ran the real Gemma 3 1B on my made-up Mama Efe, and every one of those checks passed. The book was still wrong:

- It put the market where her mother sold pepper soup in Lagos. In the story it's in Warri.
- It said she went to St. Mary's in 1969. She started in 1961 and *finished* school in 1969.
- It moved the family to Lagos in 1980. They moved in 1978; 1980 is when her son was born.
- It described Warri as "a small village in Nigeria" and Lagos as "a major port city". Nobody said either.

[SCREENSHOT: docs/screens/before-gemma-1b-book.png and docs/screens/after-book-left-out.png side by side. Caption: "Before and after the stricter checks. Same story, same Gemma 3 1B answer. Six things it said are now under Left out."]

Every name and year was in the transcript, just never together, and the descriptions came from what the model knows about Nigeria, not from what she said. The ghost wasn't inventing people. It was rearranging real ones and filling gaps with general knowledge, which is worse, because it sounds right.

So the checks got stricter. A note about a person or place is kept only if one sentence that names them says the same thing, so "her father" survives and "a major port city" doesn't. A moment's year, names and words must be said in the same sentence. Where a place has no note left, the book shows the sentence it was heard in instead. Everything removed goes under "Left out", so the family can see what the model tried to add and decide for themselves.

Whisper has its own ghosts. It heard Warri as "worry", Surulere as "Sierra Leer" and Benin City as "Ben and City", and then Gemma built the book on "Worry". So before Gemma reads anything, the app lists every name it heard, each with the sentence it came from, and asks "Did they say these names?" Fix "Worry" to "Warri" once and it's fixed in every story.

[SCREENSHOT: docs/screens/09-names.png. Caption: "Did they say these names? Each one with the sentence it was heard in."]

**The opt-in.** On a phone, a 242 MB model writes a rougher book. So there's a second option: Gemma 4 on Google's free Gemini API, with your own free key from AI Studio (no card needed). The page tells you plainly that Google's free tier may keep the text and have people read it, quoting their terms. It sends text only, never audio, and swaps the names for stand-ins (N1, N2) before sending and back after. The key lives in the tab's memory and is gone when you close it. You have to tick "Send this session's text to Google, this time only" every session.

**iPhone and data realities.** I learned these the hard way on my last project:
- A model over about 700 MB in a Safari tab tends to get the tab killed, so phones never get the 1B model.
- Downloads come down in 8 MB ranges kept as they arrive, so a dropped connection on mobile data carries on instead of starting over, and every file is checked against its SHA-256.
- Before any download the page says the size and roughly what it costs in data. At ₦500 a GB (MTN's 7 GB monthly plan is ₦3,500), the phone's speech model is about ₦20. There's always a Stop button.
- Recordings save every few seconds, so a dead battery during a story loses seconds, not the evening.

**Render.** The site is a free Render static site. I chose static on purpose: my Render workspace shares its free instance hours with other services, including a client's, and a static site uses none and never sleeps. The workspace also shares 5 GB of bandwidth a month across every service, so the site serves only the app itself, about 250 KB on a first visit. The models come from Hugging Face and the WebAssembly runtimes from jsDelivr. The site sends cross-origin isolation headers so those runtimes can use more than one thread.

**Tests.** 68 unit tests (the grounding checks, the zip writer, the resumable downloader, the name stand-ins) and an end-to-end test that runs the whole flow in Chromium with a fake microphone: consent, a 34-second recording, Whisper writing it down, the book, the archive, and opening the archive again. The test's stand-in for Gemma invents an uncle and a year on purpose, and the test fails if either reaches the book.

The test voice is macOS's synthetic "Daniel" reading a made-up story about a made-up Mama Efe from Warri. Nothing in the repo, the demo or this post is a real person's voice or story.

## Why Does Open Innovation Matter?

Because of who is talking. An elder telling family stories is going to mention who married whom, who fell out, where the land is, and which uncle never paid back the money. That should not be on a server the family doesn't control, and with open models it doesn't have to be. Whisper and Gemma run in the tab, and the archive is a .zip the family keeps.

Because of cost. It costs nothing to run: no subscription, no per-minute fee, and after the first download it works with no data at all. [ARNOLD: one line on what data or power costs mean for your family, only what you have lived.]

Because of the gap. The models that write Yorùbá, Igbo and Hausa well are open-weight fine-tunes made by African researchers. Today they need converting before a browser can run them. When that's done, swapping one into this app is a change to one file. A closed transcription API would leave me waiting for a vendor to care about Igbo.

And because of time. A story book saved as a plain HTML file, next to the original audio, doesn't depend on my app or on any company still existing. That felt like the right way to honour the past: make the record outlast the tool.

## The Spirit of It

[ARNOLD: this section is yours, and optional. If you use the app with your grandmother and she agrees, one moment from that evening: a question from "Ask next time" that led somewhere, or a story nobody had heard. Only with her consent. If not, delete this section.]

## Prize Categories

- **Best Use of Render:** the app's front end is a free Render static site, chosen so it never sleeps and never takes instance hours from anyone else.
- **Best Use of Gemma:** Gemma 3 1B and 270M run locally in the browser to write the story book, with Gemma 4 on Google's API as an explicit opt-in.

<!-- Rules note: each participant can win at most one prize. Listing both is allowed ("List every one that applies"). -->
