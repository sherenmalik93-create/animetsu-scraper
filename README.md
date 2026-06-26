# Animetsu Scraper

A self-hostable scraper + web UI for **[animetsu.live](https://animetsu.live/)** that extracts **m3u8 (HLS) stream URLs** and **WebVTT subtitle files**, enriched with **AniList** metadata (characters, studios, recommendations, trailer, trending).

Built with **Next.js 16 · TypeScript · Tailwind CSS · shadcn/ui · hls.js**. Deploys to **Vercel** in one click or runs anywhere with **Docker**.

> ⚠️ **Educational project.** Streams are proxied from animetsu.live for personal use only. The maintainer does not host any media content. Support the official release when available in your region.

---

## Features

- 🔍 **Search** — instant debounced search across the entire animetsu.live catalog
- 🎬 **HLS player** — hls.js-powered player with quality switcher (360p / 720p / 1080p) and VTT subtitle selector
- 📺 **4 streaming servers** — `kite` (soft sub, default) · `dio` · `sage` · `meg`
- 🅰️ **Sub / Dub toggle** — switch between subtitled and dubbed sources per episode
- ⏭️ **Skip intro / outro** — auto-detected skip markers surface as in-player buttons
- 🧠 **AniList enrichment** — characters, studios, recommendations, YouTube trailer, next-airing countdown
- 🔥 **Trending now** — pulled from the AniList GraphQL API on the home page
- 🆕 **Recently released** — live from animetsu.live
- 🛡️ **Cloudflare-friendly** — built-in CORS proxy rewrites all upstream URIs through your own domain, with retry + fallback logic for 403/429/503 challenges
- 🐳 **One-command Docker** — `docker compose up` and you're done
- ▲ **One-click Vercel** — pure Node.js runtime, no native deps

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser (you)                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  /  →  Home (search · trending · recent)                  │   │
│  │  ↓ click anime                                           │   │
│  │  /?anime=<id>  →  Details (info · episodes · trailer)    │   │
│  │  ↓ click episode                                         │   │
│  │  /?watch=<id>&ep=<n>  →  HLS Player                       │   │
│  └──────────────────────────────────────────────────────────┘   │
└───────────────────────────────┬─────────────────────────────────┘
                                │  fetch (same origin)
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Next.js (your domain)                       │
│                                                                  │
│  /api/scrape/search      ─┐                                      │
│  /api/scrape/info         │  ──►  animetsu.live/v2/api/anime/*  │
│  /api/scrape/episodes     │       (Cloudflare-fronted JSON)     │
│  /api/scrape/servers      │                                      │
│  /api/scrape/sources      │  ──►  parses master m3u8 +          │
│  /api/scrape/recent      ─┘       resolves swiftstream.top URLs │
│                                                                  │
│  /api/scrape/anilist     ────►  graphql.anilist.co              │
│                                                                  │
│  /api/proxy/m3u8?url=…   ────►  swiftstream.top/proxy/oppai/…   │
│       │                              │                           │
│       │       ┌──────────────────────┘                           │
│       │       ▼                                                  │
│       │   Rewrites all relative URIs in the playlist             │
│       │   back through /api/proxy/m3u8 so the player             │
│       │   keeps calling our own origin (CORS-safe).              │
│       ▼                                                          │
│   Returns application/vnd.apple.mpegurl                          │
│   or text/vtt for subtitle files                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Key files

| Path | Purpose |
| --- | --- |
| `src/lib/animetsu/client.ts` | HTTP client for the animetsu.live JSON API, with retry + CF fallback |
| `src/lib/animetsu/types.ts` | TypeScript types for all upstream payloads |
| `src/lib/anilist/client.ts` | AniList GraphQL client (cached, rate-limit-friendly) |
| `src/app/api/scrape/*` | Thin API routes exposing the scraper to the frontend |
| `src/app/api/proxy/m3u8/route.ts` | CORS proxy that rewrites m3u8 playlist URIs |
| `src/components/animetsu/hls-player.tsx` | hls.js player with quality + subtitle switcher |
| `src/app/page.tsx` | Single-page UI: home → details → watch |

---

## Quick start (local dev)

```bash
git clone <this-repo> animetsu-scraper
cd animetsu-scraper
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
| `ANIMETSU_API_BASE` | `https://animetsu.live/v2/api/anime` | Override the upstream JSON API base |
| `SWIFTSTREAM_PROXY` | `https://swiftstream.top/proxy` | Override the m3u8 / subtitle proxy |
| `FALLBACK_PROXY` | *(empty)* | Optional cors-anywhere-style proxy used when Cloudflare returns a 403/429/503 |

---

## API reference

All routes are GET. Responses are JSON unless noted.

### `GET /api/scrape/search?q=<query>`

Search the animetsu.live catalog.

```jsonc
{
  "results": [
    {
      "id": "6989b89f29cf95f4eb03b4ed",
      "title": { "romaji": "ONE PIECE", "english": "ONE PIECE", "native": "ONE PIECE" },
      "cover_image": { "large": "https://s4.anilist.co/..." },
      "year": 1999,
      "average_score": 87,
      "total_eps": null,
      "genres": ["Action", "Adventure", "Comedy"]
    }
  ]
}
```

### `GET /api/scrape/info?id=<animetsuId>&enrich=1`

Returns the animetsu anime info, optionally merged with AniList data when `enrich=1` (default).

### `GET /api/scrape/episodes?id=<animetsuId>`

Returns the list of episodes (`ep_num`, `name`, `desc`, `is_filler`, `views`, `aired_at`, `img`).

### `GET /api/scrape/servers?id=<animetsuId>&ep=<epNum>`

Returns the available streaming servers: `kite` (default, soft sub) · `dio` · `sage` · `meg`.

### `GET /api/scrape/sources?id=<watchId>&ep=<epNum>&server=kite&type=sub`

Returns a player-ready payload:

```jsonc
{
  "masterUrl": "/api/proxy/m3u8?url=https%3A%2F%2F…",
  "qualities": [
    { "label": "360p",  "resolution": "640x360",   "url": "/api/proxy/m3u8?url=…" },
    { "label": "720p",  "resolution": "1280x720",  "url": "/api/proxy/m3u8?url=…" },
    { "label": "1080p", "resolution": "1920x1080", "url": "/api/proxy/m3u8?url=…" }
  ],
  "subtitles": [
    { "lang": "English", "url": "/api/proxy/m3u8?format=vtt&url=…" }
  ],
  "skips": { "intro": { "start": 0, "end": 0 }, "outro": { "start": 0, "end": 0 } },
  "server": "kite",
  "needProxy": true
}
```

### `GET /api/proxy/m3u8?url=<encoded>`

CORS proxy for upstream m3u8 / segment / VTT URLs. Auto-detects content type:

- `application/vnd.apple.mpegurl` content → rewrites all relative URIs in the playlist back through `/api/proxy/m3u8`
- `text/vtt` content → passes through with `text/vtt; charset=utf-8`
- Binary segments (TS / fMP4) → streamed through with upstream content-type

Add `&format=vtt` to force subtitle handling, or `&format=m3u8` to force playlist handling.

### `GET /api/scrape/anilist?id=<anilistId>` | `?search=<q>` | `?trending=1`

Direct AniList GraphQL passthrough. Cached for 30 min.

---

## How the scraper works (under the hood)

1. The animetsu.live frontend is a Vite SPA. Its main bundle reveals the API base: `window.b = https://animetsu.live/v2` and an axios instance at `ole = ${b}/api`.
2. All API calls are routed through `${ole}/anime/<key>`. The interesting keys are:
   - `search/?query=<q>`
   - `info/<id>`
   - `eps/<id>`
   - `servers/<id>/<ep>`
   - `oppai/<id>/<ep>?server=<s>&source_type=sub|dub` ← returns `{ sources, subs, skips }`
3. The `sources[].url` is a relative path like `/oppai/kite/<token>`. When `need_proxy === true`, the host is `https://swiftstream.top/proxy` — that's the same host used by the official player.
4. The master playlist returned by swiftstream contains relative token paths for each quality (360p / 720p / 1080p). We parse them and resolve them against the master URL.
5. Subtitles come back as full `https://swiftstream.top/proxy/oppai/kite/<token>` URLs in **WebVTT** format — ready to drop into a `<track>` element.
6. Because the browser can't directly fetch `swiftstream.top` from our domain (CORS + occasional CF challenges), we funnel everything through `/api/proxy/m3u8`. The proxy:
   - Sends a realistic `User-Agent` + `Referer: https://animetsu.live/` so Cloudflare doesn't challenge us
   - Detects m3u8 content and rewrites every relative URI in the playlist to point back through itself
   - Sets `Access-Control-Allow-Origin: *` so the browser is happy

This mirrors the approach taken by public anime scraper projects like **Miruro** and **Anikage** (consumer-style aggregators), but is rewritten from scratch in TypeScript with a cleaner separation between scraper library, API layer, and UI.

---

## Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | **Next.js 16** (App Router) | One codebase for API + UI, deploys to Vercel out of the box |
| Language | **TypeScript 5** | Strict typing for upstream payloads |
| UI | **Tailwind CSS 4** + **shadcn/ui** | Fast, accessible, themeable |
| Player | **hls.js** | Industry-standard HLS in pure JS, works on every modern browser |
| State | React hooks (no global store needed) | App is a single-page flow |
| Caching | In-memory LRU + `Cache-Control` headers | No external cache infra required |
| Container | **Docker** (Node 22-alpine, standalone) | ~150 MB final image |
| Host | **Vercel** or any Node host | Pure JS — no native deps |

---

## License

MIT — see `LICENSE`. The project is provided for educational purposes. Use responsibly and in accordance with the laws of your jurisdiction.
