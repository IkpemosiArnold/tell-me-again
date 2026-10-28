# Deploying Tell Me Again

One free Render static site. It needs no keys, no database and no server.

## What is set up (28 Oct 2026, through the Render API)

| Setting | Value |
|---|---|
| Service | `tellmeagain` (srv-dbgs0jm7bikc73be9qqg), type static site, no plan (static sites are free) |
| Address | https://tellmeagain.onrender.com |
| Repository | https://github.com/IkpemosiArnold/tell-me-again, branch `main`, auto-deploy on push |
| Build command | `npm ci && npm run build` |
| Publish directory | `dist` |
| Environment | `NODE_VERSION=22` |
| Pull request previews | off (each preview would use build minutes) |
| Custom domain | none. The Hobby workspace includes 2 custom domains, both in use (selects, comethrough); a third costs $0.25 a month. |

Headers (the same as `render.yaml`):

| Path | Header | Value |
|---|---|---|
| `/*` | Cross-Origin-Opener-Policy | `same-origin` |
| `/*` | Cross-Origin-Embedder-Policy | `require-corp` |
| `/*` | X-Content-Type-Options | `nosniff` |
| `/*` | Referrer-Policy | `no-referrer` |
| `/*` | Permissions-Policy | `microphone=(self), camera=(), geolocation=()` |
| `/assets/*` | Cache-Control | `public, max-age=31536000, immutable` |
| `/index.html` | Cache-Control | `no-cache` |

COOP and COEP make the page cross-origin isolated, so ONNX Runtime and llama.cpp can use several threads. Every cross-origin request the page makes (Hugging Face, jsDelivr, the Gemini API) is a CORS fetch, which `require-corp` allows.

## Why a static site

- **Instance hours.** Static sites use none and never sleep. The workspace's 750 free hours a month are shared with other free web services, including a client's.
- **Bandwidth.** The Hobby workspace includes 5 GB of outbound bandwidth a month, shared by every service. Going over with no card on file suspends all free services until the next month. So this site serves only the app: about 40 KB of JavaScript and 4 KB of CSS (compressed), one font file of 110 KB, and a 560 KB speech worker that is fetched only when someone writes a story down. The models (41 MB to 722 MB) come from Hugging Face, and the WebAssembly runtimes from jsDelivr. The 27 MB ONNX Runtime file is removed from the build (`vite.config.js`), so it can never be served from Render by mistake.
- **Build minutes.** About 2 minutes per deploy, from the workspace's 500 a month.

## Check a deploy

```sh
curl -sI https://tellmeagain.onrender.com/ | grep -i -E "cross-origin|content-type"
# cross-origin-embedder-policy: require-corp
# cross-origin-opener-policy: same-origin
```

In the browser console on the live page, `crossOriginIsolated` must be `true`.

## Starting again from the blueprint

In Render: New, Blueprint, pick the repository. `render.yaml` creates the same static site with the same headers. Render keeps any header rules that are not in the file.
