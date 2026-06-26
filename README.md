# Anime Scraper

A self-hostable, multi-provider anime scraper + web UI that extracts **m3u8 (HLS) streams**, **MP4 streams**, and **WebVTT subtitles** from multiple upstream anime sites, enriched with **AniList** metadata.

Built with **Next.js 16 · TypeScript · Tailwind CSS · shadcn/ui · hls.js**. Deploys to **Vercel** in one click or runs anywhere with **Docker**.

> ⚠️ **Educational project.** Streams are proxied from upstream providers for personal use only. The maintainer does not host any media content. Support the official release when available in your region.

---

## Features

- 🎛️ **Multi-provider architecture** — switch between upstreams from the UI with one click
  - **Animetsu** — `animetsu.live` · soft sub · 4 servers (kite / dio / sage / meg) · HLS m3u8
  - **Anikuro** — `anikuro.ru` · aggregates 11 upstreams (animeverse / animegg / anikoto / animepahe / reanime / animedao / anidb / animedunya / animeverse / allani / senshi / animix) · MP4 + HLS
- 🔍 **Search** — instant debounced search across the active provider's catalog
- 🎬 **Universal media player** — hls.js for HLS, native HTML5 for MP4, with quality switcher and VTT subtitle selector
- 🅰️ **Sub / Dub toggle** — switch between subtitled and dubbed sources per episode
- ⏭️ **Skip intro / outro** — auto-detected skip markers surface as in-player buttons
- 🧠 **AniList enrichment** — characters, studios, recommendations, YouTube trailer, next-airing countdown
- 🔥 **Trending now** — pulled from the AniList GraphQL API on the home page
- 🆕 **Recently released** — live from animetsu.live
- 🛡️ **Cloudflare-friendly** — built-in CORS proxy rewrites all upstream URIs through your own domain, with retry + fallback logic for 403/429/503 challenges, and per-upstream Referer support
- 🐳 **One-command Docker** — `docker compose up` and you're done
- ▲ **One-click Vercel** — pure Node.js runtime, no native deps

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser (you)                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  /  →  Home (search · trending · recent)                  │   │
│  │        [Provider switcher: Animetsu ⇄ Anikuro]            │   │
│  │  ↓ click anime                                           │   │
│  │  /?anime=<id>  →  Details (info · episodes · trailer)    │   │
│  │  ↓ click episode                                         │   │
│  │  /?watch=<id>&ep=<n>  →  MediaPlayer (HLS or MP4)         │   │
│  └──────────────────────────────────────────────────────────┘   │
└───────────────────────────────┬─────────────────────────────────┘
                                │  fetch (same origin, ?provider=…)
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Next.js (your domain)                       │
│                                                                  │
│  /api/scrape/providers    →  list of registered providers        │
│  /api/scrape/search       ─┐                                     │
│  /api/scrape/info          │                                     │
│  /api/scrape/episodes      │  →  dispatches to the active        │
│  /api/scrape/servers       │     provider (animetsu or anikuro)  │
│  /api/scrape/sources      ─┘                                     │
│                                                                  │
│  /api/scrape/anilist      →  AniList GraphQL (enrichment)        │
│  /api/scrape/recent       →  animetsu recent releases            │
│                                                                  │
│  /api/proxy/m3u8?url=…&referer=…                                │
│       │  Handles both HLS playlists and MP4 streams              │
│       │  - HLS: rewrites relative URIs through itself            │
│       │  - MP4: passes through with Range support                │
│       │  - Sets the right Referer per upstream                   │
│       ▼                                                          │
│   Provider abstraction:                                          │
│   ┌──────────────┐  ┌──────────────┐                             │
│   │  Animetsu    │  │  Anikuro     │                             │
│   │  /v2/api/    │  │  /api/v1/    │                             │
│   │  anime/*     │  │  anime/*     │                             │
│   │              │  │              │                             │
│   │  ↳ kite      │  │  ↳ 11 upstreams                            │
│   │  ↳ dio       │  │    tried in parallel                       │
│   │  ↳ sage      │  │    MP4 preferred                            │
│   │  ↳ meg       │  │                                              │
│   └──────────────┘  └──────────────┘                             │
└─────────────────────────────────────────────────────────────────┘
```

### Key files

| Path | Purpose |
| --- | --- |
| `src/lib/providers/types.ts` | Unified `Provider` interface — every backend implements this |
| `src/lib/providers/index.ts` | Provider registry — single source of truth |
| `src/lib/providers/animetsu.ts` | Animetsu adapter (wraps the animetsu client) |
| `src/lib/providers/anikuro.ts` | Anikuro adapter (multi-provider fan-out, MP4 preference) |
| `src/lib/animetsu/client.ts` | Raw HTTP client for animetsu.live |
| `src/lib/anilist/client.ts` | AniList GraphQL client (cached, rate-limit-friendly) |
| `src/app/api/scrape/*` | API routes — all accept `?provider=animetsu|anikuro` |
| `src/app/api/proxy/m3u8/route.ts` | Universal CORS proxy (HLS + MP4 + VTT, per-upstream Referer) |
| `src/components/animetsu/media-player.tsx` | Universal player — HLS via hls.js, MP4 via native `<video>` |
| `src/app/page.tsx` | Single-page UI with provider switcher |

---

## Quick start (local dev)

```bash
git clone <this-repo> anime-scraper
cd anime-scraper
bun install                 # or: npm install / pnpm install
cp .env.example .env.local  # optional — defaults already work
bun run dev                 # → http://localhost:3000
```

---

## Deploy to Vercel

1. Push this repo to GitHub.
2. Go to [vercel.com/new](https://vercel.com/new) and import the repo.
3. Vercel auto-detects Next.js — no build config needed.
4. (Optional) Set environment variables from `.env.example` in **Project → Settings → Environment Variables**.
5. Click **Deploy**. Done.

`vercel.json` already bumps the `/api/proxy/m3u8` function to **60 s maxDuration + 1 GB RAM** so it can stream long episodes without timing out.

---

## Self-host with Docker

```bash
docker compose up -d --build
# → http://localhost:3000
```

The Dockerfile uses Next.js **standalone output** — the final image is ~150 MB and runs as a non-root user.

| Env var | Default | Purpose |
| --- | --- | --- |
| `ANIMETSU_API_BASE` | `https://animetsu.live/v2/api/anime` | Override the animetsu JSON API base |
| `SWIFTSTREAM_PROXY` | `https://swiftstream.top/proxy` | Override the animetsu m3u8 / subtitle proxy |
| `ANIKURO_BASE` | `https://anikuro.ru` | Override the anikuro API base |
| `ANIKURO_PROXY` | `https://proxy.anikuro.ru` | Override the anikuro MP4 / m3u8 proxy |
| `FALLBACK_PROXY` | *(empty)* | Optional cors-anywhere-style proxy used when Cloudflare returns a 403/429/503 |

---

## API reference

All routes are GET. Responses are JSON unless noted. All `/api/scrape/*` routes accept a `?provider=animetsu|anikuro` query param (defaults to `animetsu`).

### `GET /api/scrape/providers`

Returns the list of registered providers.

```jsonc
{
  "providers": [
    { "id": "animetsu", "label": "Animetsu", "description": "…", "defaultServer": "kite", "supportsDub": true },
    { "id": "anikuro",  "label": "Anikuro",  "description": "…", "defaultServer": "animeverse", "supportsDub": true }
  ]
}
```

### `GET /api/scrape/search?q=<query>&provider=<id>`

Returns `results[]` with the provider-specific id, title, cover image, year, score, etc.

### `GET /api/scrape/info?id=<id>&provider=<id>&enrich=1`

Returns the full anime info, optionally merged with AniList data when `enrich=1` (default).

### `GET /api/scrape/episodes?id=<id>&provider=<id>`

Returns the list of episodes.

### `GET /api/scrape/servers?id=<id>&ep=<epNum>&provider=<id>`

Returns the available streaming servers for that episode.

- **Animetsu**: `kite` (default, soft sub) · `dio` · `sage` · `meg`
- **Anikuro**: `animeverse` (default, MP4) · `animegg` · `anikoto` · `animepahe` · `reanime` · `animedao` · `animegg` · `anidb` · `animedunya` · `animeverse` · `allani` · `senshi` · `animix`

### `GET /api/scrape/sources?id=<id>&ep=<epNum>&server=<server>&type=sub|dub&provider=<id>`

Returns a player-ready payload:

```jsonc
{
  "sources": [
    { "url": "/api/proxy/m3u8?url=…", "type": "master", "quality": "auto", "isMaster": true },
    { "url": "/api/proxy/m3u8?url=…", "type": "hls",    "quality": "1080p" },
    // OR
    { "url": "https://proxy.anikuro.ru/…", "type": "mp4", "quality": "720p" }
  ],
  "subtitles": [{ "lang": "English", "url": "/api/proxy/m3u8?format=vtt&url=…" }],
  "skips": { "intro": { "start": 0, "end": 0 }, "outro": { "start": 0, "end": 0 } },
  "server": "animeverse",
  "provider": "anikuro",
  "qualities": [{ "label": "1080p", "resolution": "1920x1080", "url": "…" }]
}
```

For anikuro, if `server` is omitted or set to `auto`/`default`, the provider fans out to a curated subset of upstreams in parallel and returns the best playable source (preferring MP4 over HLS).

### `GET /api/proxy/m3u8?url=<encoded>&referer=<encoded>&format=<vtt|m3u8>`

Universal CORS proxy for upstream m3u8 / MP4 / VTT URLs. Auto-detects content type:

- `application/vnd.apple.mpegurl` content → rewrites all relative URIs in the playlist back through `/api/proxy/m3u8` (preserving the `&referer=` if provided)
- `video/mp4` content → streamed through with Range support
- `text/vtt` content → passed through with `text/vtt; charset=utf-8`
- Binary segments (TS / fMP4) → streamed through with upstream content-type

The optional `?referer=` param sets the `Referer` header sent to the upstream — required for anikuro HLS streams that come from referer-locked CDNs.

### `GET /api/scrape/anilist?id=<anilistId>` | `?search=<q>` | `?trending=1`

Direct AniList GraphQL passthrough. Cached for 30 min.

---

## Adding a new provider

The provider abstraction makes it trivial to add a new upstream site:

1. Create `src/lib/providers/<name>.ts` and implement the `Provider` interface:
   ```ts
   export const myProvider: Provider = {
     meta: { id: "mine", label: "Mine", /* … */ },
     async search(query) { /* … */ return []; },
     async getInfo(id) { /* … */ return null; },
     async getEpisodes(id) { /* … */ return []; },
     async getServers(id, ep) { /* … */ return []; },  // optional
     async getSources(opts) { /* … */ return { sources, subtitles, server, provider: "mine" }; },
   };
   ```
2. Register it in `src/lib/providers/index.ts`:
   ```ts
   export const providers: Record<ProviderId, Provider> = {
     animetsu: animetsuProvider,
     anikuro: anikuroProvider,
     mine: myProvider,  // ← add here
   };
   ```
3. Add the provider id to the `ProviderId` union type in `src/lib/providers/types.ts`.

The UI and API routes will pick it up automatically — no other changes needed.

---

## How each provider works

### Animetsu

1. The animetsu.live frontend is a Vite SPA. Its main bundle reveals the API base: `window.b = https://animetsu.live/v2` and an axios instance at `ole = ${b}/api`.
2. All API calls are routed through `${ole}/anime/<key>`. The interesting keys are:
   - `search/?query=<q>`
   - `info/<id>`
   - `eps/<id>`
   - `servers/<id>/<ep>`
   - `oppai/<id>/<ep>?server=<s>&source_type=sub|dub` ← returns `{ sources, subs, skips }`
3. The `sources[].url` is a relative path like `/oppai/kite/<token>`. When `need_proxy === true`, the host is `https://swiftstream.top/proxy`.
4. The master playlist contains relative token paths for each quality (360p / 720p / 1080p).
5. Subtitles come back as full `https://swiftstream.top/proxy/oppai/kite/<token>` URLs in **WebVTT** format.

### Anikuro

1. Anikuro.ru is a Next.js-style site with a clean JSON API at `/api/v1/*` that aggregates 11 upstream anime providers.
2. Endpoints used:
   - `discovery/search?query=<q>` → search
   - `anime/<id>` → info (id is the AniList id)
   - `anime/<id>/episodes` → episode list
   - `sources/<provider>/<animeId>:<epNum>` → stream sources for a specific upstream provider
3. Stream URLs come back pre-wrapped through `https://proxy.anikuro.ru/<base64>.m3u8|referer?proxy=0` where the base64 decodes to `<streamUrl>|<upstreamReferer>`.
4. As of 2026-06, anikuro's m3u8 proxy returns HTTP 500, but the **MP4 proxy works** with Range support. The provider prefers MP4 sources (animeverse, animegg) and falls back to HLS (anikoto, animix) routed through our own `/api/proxy/m3u8` with the upstream Referer set.
5. When `server=auto` (the default), the provider fans out to a curated subset of 4 upstreams in parallel (~600 ms total), then falls back to the remaining 7 if no hit was found.

---

## Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | **Next.js 16** (App Router) | One codebase for API + UI, deploys to Vercel out of the box |
| Language | **TypeScript 5** | Strict typing for upstream payloads |
| UI | **Tailwind CSS 4** + **shadcn/ui** | Fast, accessible, themeable |
| Player | **hls.js** + native HTML5 `<video>` | HLS for adaptive streaming, native for MP4 |
| State | React hooks (no global store needed) | App is a single-page flow |
| Caching | In-memory LRU + `Cache-Control` headers | No external cache infra required |
| Container | **Docker** (Node 22-alpine, standalone) | ~150 MB final image |
| Host | **Vercel** or any Node host | Pure JS — no native deps |

---

## License

MIT — see `LICENSE`. The project is provided for educational purposes. Use responsibly and in accordance with the laws of your jurisdiction.
