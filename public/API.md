# Animetsu Scraper API Reference

A unified REST API for searching anime catalogs, fetching episode lists, and
resolving playable stream URLs across multiple providers.

**Version:** 1.4.0  
**Base URL:** `https://your-deployment.example.com/api/scrape`  
**Auth:** None (self-host behind your own gateway)  
**Format:** JSON only

## Table of Contents

- [Quick Start](#quick-start)
- [Providers](#providers)
- [Endpoints](#endpoints)
  - [GET /providers](#get-providers)
  - [GET /search](#get-search)
  - [GET /info](#get-info)
  - [GET /episodes](#get-episodes)
  - [GET /servers](#get-servers)
  - [GET /sources](#get-sources)
  - [GET /raw](#get-raw)
  - [GET /recent](#get-recent)
  - [GET /anilist](#get-anilist)
  - [GET /api/proxy/m3u8](#get-apiproxym3u8)
- [TypeScript Types](#typescript-types)
- [Errors](#errors)
- [Changelog](#changelog)

---

## Quick Start

The canonical flow is: **search → info → episodes → sources**.

```bash
# 1. Search
curl "https://your-deployment.example.com/api/scrape/search?q=frieren&provider=animetsu"

# 2. Get info (id comes from step 1)
curl "https://your-deployment.example.com/api/scrape/info?id=6989b8a029cf95f4eb03b500&provider=animetsu"

# 3. Get episodes
curl "https://your-deployment.example.com/api/scrape/episodes?id=6989b8a029cf95f4eb03b500&provider=animetsu"

# 4. Get sources for episode 1 (server=kite, type=sub)
curl "https://your-deployment.example.com/api/scrape/sources?id=6989b8a029cf95f4eb03b500&ep=1&server=kite&type=sub&provider=animetsu"

# 5. The first source URL is already proxied — pipe it into mpv / ffplay
curl -s "https://your-deployment.example.com/api/scrape/sources?id=6989b8a029cf95f4eb03b500&ep=1&server=kite&type=sub&provider=animetsu" \
  | jq -r '.sources[] | select(.isMaster) | .url' \
  | xargs mpv
```

### JavaScript Example

```javascript
const BASE = "https://your-deployment.example.com/api/scrape";
const provider = "animetsu";

const search = await fetch(`${BASE}/search?q=frieren&provider=${provider}`).then((r) => r.json());
const anime = search.results[0];

const episodes = await fetch(`${BASE}/episodes?id=${anime.id}&provider=${provider}`).then((r) => r.json());

const sources = await fetch(`${BASE}/sources?id=${anime.id}&ep=1&server=kite&type=sub&provider=${provider}`).then((r) => r.json());

// Use with hls.js
const master = sources.sources.find((s) => s.isMaster);
const hls = new Hls();
hls.loadSource(master.url);
hls.attachMedia(videoElement);
```

### Python Example

```python
import requests

BASE = "https://your-deployment.example.com/api/scrape"
PROVIDER = "animetsu"

search = requests.get(f"{BASE}/search", params={"q": "frieren", "provider": PROVIDER}).json()
anime = search["results"][0]

episodes = requests.get(f"{BASE}/episodes", params={"id": anime["id"], "provider": PROVIDER}).json()

sources = requests.get(f"{BASE}/sources", params={
    "id": anime["id"], "ep": 1, "server": "kite",
    "type": "sub", "provider": PROVIDER,
}).json()

master = next(s for s in sources["sources"] if s["isMaster"])
print(f"Play this URL: {master['url']}")
```

---

## Providers

| ID | Label | Description | Supports Dub | Default Server |
|----|-------|-------------|--------------|----------------|
| `animetsu` | Animetsu | Soft sub · Multi quality · Cloudflare-fronted | Yes | `kite` |
| `anikuro` | Anikuro | 11 upstream providers · Sub/Dub · AniList IDs native | Yes | `animeverse` |
| `animeyubi` | Animeyubi | AnimePahe mirror · Sub/Dub · Kwik embeds | Yes | `kwik-mp4` |
| `miruro` | Miruro | AniList-native · 7 streaming providers · Sub/Dub · Skip markers | Yes | `bonk` |
| `animex` | Animex | AniList-native catalog with flixcloud.cc embeds (sub + dual audio) | Yes | `flixcloud` |
| `anilight` | Anilight | AniList-native catalog · MegaPlay streams · Sub/Dub · Skip markers | Yes | `megaplay` |
| `anipm` | Ani.pm | Ani.pm — Vega MP4 + Onyx HLS + MegaPlay · sub & dub · all servers | Yes | `onyx-hls` |

### Per-provider ID formats

| Provider | ID format | Example |
|----------|-----------|---------|
| `animetsu` | Mongo ObjectId | `6989b8a029cf95f4eb03b500` |
| `anikuro` | numeric or `al:{anilistId}` | `12345` or `al:154587` |
| `animeyubi` | slug | `sousou-no-frieren` |
| `miruro` | `al:{anilistId}` | `al:154587` |
| `animex` | `al:{anilistId}` | `al:182205` |
| `anilight` | `al:{anilistId}:{slug}` | `al:154587:sousou-no-frieren` |
| `anipm` | `anipm:{seriesId}:{slug}` | `anipm:6351:frieren-beyond-journey-s-end-c6fbj` |

### Per-provider source types

Every provider returns a `sources[]` array in `/sources` and `/raw`. Each entry has a `type` field:

| Type | Meaning | Player handling |
|------|---------|-----------------|
| `master` | HLS master playlist (m3u8 with multiple quality variants) | Drop into hls.js — quality picker comes free |
| `hls` | HLS variant playlist | Drop into hls.js |
| `mp4` | Direct MP4 file (range-supported) | Use `<video>` directly |
| `iframe` | Embed URL (Cloudflare-protected) | Use `<iframe>` — user's browser solves any challenge |

**anipm** returns sources in priority order: m3u8 first, MP4 second, iframe last.

---

## Endpoints

All paths are relative to `/api/scrape` (except the CORS proxy which is at `/api/proxy`).

### GET /providers

List all registered providers.

**Params:** none

**Response:**
```json
{
  "providers": [
    {
      "id": "animetsu",
      "label": "Animetsu",
      "description": "Soft sub · Multi quality · Cloudflare-fronted",
      "accent": "from-rose-500 to-orange-500",
      "supportsDub": true,
      "defaultServer": "kite"
    }
  ]
}
```

**Cache:** 1 hour.

---

### GET /search

Search a provider's catalog.

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `q` | string | yes | — | Free-text search query |
| `provider` | enum | no | `animetsu` | `animetsu`, `anikuro`, or `animeyubi` |

**Response:**
```json
{
  "results": [
    {
      "id": "6989b8a029cf95f4eb03b500",
      "title": { "romaji": "Sousou no Frieren", "english": "Frieren: Beyond Journey's End", "native": "葬送のフリーレン" },
      "coverImage": { "large": "https://..." },
      "description": "Frieren, an elven mage...",
      "status": "FINISHED",
      "year": 2023,
      "format": "TV",
      "genres": ["Adventure", "Drama", "Fantasy"],
      "averageScore": 89,
      "totalEpisodes": 28,
      "isAdult": false,
      "duration": 24,
      "season": "FALL"
    }
  ],
  "provider": "animetsu"
}
```

**Provider differences:**
- `animetsu` — no `anilistId` in search results
- `anikuro` — native `anilistId` and `malId` for every result
- `animeyubi` — minimal metadata (title + cover image only); use `/info` for full doc

**Cache:** 60s client / 300s CDN.

---

### GET /info

Get the full metadata document for a single anime. Auto-enriches with AniList data if the provider exposes an `anilistId`.

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | string | yes | — | Anime id from `/search` |
| `provider` | enum | no | `animetsu` | Provider id |
| `enrich` | 0 \| 1 | no | `1` | Set to `0` to skip AniList enrichment |

**Response:** the unified search result shape, plus an `anilist` field if enrichment happened:

```json
{
  "id": "6989b8a029cf95f4eb03b500",
  "anilistId": 154587,
  "malId": 52991,
  "title": { "romaji": "...", "english": "...", "native": "..." },
  "coverImage": { "large": "https://..." },
  "description": "...",
  "status": "FINISHED",
  "year": 2023,
  "totalEpisodes": 28,
  "anilist": {
    "id": 154587,
    "trailer": { "id": "ASLk6aY-B3Q", "site": "youtube" },
    "studios": [{ "id": 1441, "name": "Madhouse", "isAnimationStudio": true }],
    "characters": [
      {
        "id": 1,
        "name": { "full": "Frieren", "native": "フリーレン" },
        "image": "https://...",
        "role": "MAIN",
        "voiceActor": { "name": { "full": "Atsumi Tanezaki" } }
      }
    ],
    "recommendations": [...]
  }
}
```

**Errors:** `404` if id doesn't exist.

**Cache:** 300s client / 600s CDN.

---

### GET /episodes

Get the full episode list for an anime.

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | string | yes | — | Anime id |
| `provider` | enum | no | `animetsu` | Provider id |

**Response:** an array of episodes, sorted by number:

```json
[
  {
    "number": 1,
    "displayNumber": "1",
    "sourceId": "6989b8a029cf95f4eb03b500",
    "title": "The Journey's End",
    "description": "After a ten-year journey...",
    "thumbnail": "https://...",
    "airedAt": "2023-09-29T16:00:00.000Z",
    "duration": 24,
    "filler": false,
    "variants": ["sub", "dub"]
  }
]
```

**Cache:** 120s client / 600s CDN.

---

### GET /servers

Get the list of available streaming servers for a specific episode.

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | string | yes | — | Anime id |
| `ep` | number | yes | — | Episode number (1-indexed) |
| `provider` | enum | no | `animetsu` | Provider id |

**Response:** an array of servers. Each provider has different servers:

```json
[
  { "id": "kite", "label": "kite", "default": true },
  { "id": "gogo", "label": "gogo" }
]
```

For `anikuro`, each upstream IS a server (animeverse, animepahe, anikoto, etc.). For `animeyubi`, the two servers are `kwik-mp4` and `kwik-hls`.

**Cache:** 120s client / 600s CDN.

---

### GET /sources

**The main endpoint.** Resolves playable stream URLs for a specific episode.

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | string | yes | — | Anime id |
| `ep` | number | yes | — | Episode number (1-indexed) |
| `server` | string | no | provider default | Server id from `/servers` |
| `type` | enum | no | `sub` | Audio variant: `sub` or `dub` |
| `provider` | enum | no | `animetsu` | Provider id |

**Response:**

```json
{
  "sources": [
    {
      "url": "/api/proxy/m3u8?url=https%3A%2F%2Fswiftstream.top%2F...%2Fmaster.m3u8",
      "type": "master",
      "quality": "auto",
      "isMaster": true,
      "originalUrl": "https://swiftstream.top/.../master.m3u8"
    },
    {
      "url": "/api/proxy/m3u8?url=https%3A%2F%2Fswiftstream.top%2F...%2F1080p.m3u8",
      "type": "hls",
      "quality": "1080p"
    }
  ],
  "subtitles": [
    { "url": "/api/proxy/m3u8?format=vtt&url=https%3A%2F%2F...%2Fen.vtt", "lang": "English" }
  ],
  "skips": {
    "intro": { "start": 5, "end": 95 },
    "outro": { "start": 1380, "end": 1440 }
  },
  "server": "kite",
  "provider": "animetsu",
  "qualities": [
    { "label": "1080p", "resolution": "1920x1080", "url": "/api/proxy/m3u8?url=..." },
    { "label": "720p", "resolution": "1280x720", "url": "/api/proxy/m3u8?url=..." }
  ]
}
```

**Source types:**
| Type | Meaning | How to play |
|------|---------|-------------|
| `master` | Adaptive HLS playlist | Preferred for hls.js / Safari native HLS |
| `hls` | Single-quality HLS | Use with hls.js |
| `mp4` | Direct MP4 file | Use in a `<video>` tag, supports Range |
| `iframe` | kwik.cx embed URL | Render in `<iframe allow="autoplay; fullscreen">` |

**Cache:** 60s client / 120s CDN.

---

### GET /raw

Returns the raw upstream JSON the provider's API returned, before normalization. Same params as `/sources`.

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | string | yes | — | Anime id |
| `ep` | number | yes | — | Episode number |
| `server` | string | no | — | Server id |
| `type` | enum | no | `sub` | `sub` or `dub` |
| `provider` | enum | no | `animetsu` | Provider id |

**Response:**

```json
{
  "provider": "animeyubi",
  "animeId": "6989b8a029cf95f4eb03b500",
  "episode": 1,
  "server": "kwik-mp4",
  "streamType": "sub",
  "raw": { /* ... raw upstream payload ... */ },
  "rawMulti": null,
  "unified": {
    "sources": [ /* ... same shape as /sources ... */ ],
    "subtitles": [],
    "skips": null,
    "qualities": null
  }
}
```

**Raw shape per provider:**
- **animetsu:** the upstream `SourcesResponse` object (sources[], subs[], skips)
- **anikuro:** `rawMulti` is an object keyed by upstream provider name (animeverse, animepahe, etc.)
- **animeyubi:** a normalized MegaPlay-style payload with `hls_url`, `mp4_url`, `embed_url`, `stream_type`, `cdn_host`, etc.

The response always includes a `unified` field so you can see both raw and normalized side by side.

**Cache:** `no-store` (always fresh).

---

### GET /recent

Get the most recently added anime episodes from the animetsu upstream. Animetsu-only — no provider parameter.

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `page` | number | no | `1` | Page number (1-indexed) |
| `per_page` | number | no | `20` | Results per page (max 50) |

**Response:**

```json
{
  "currentPage": 1,
  "perPage": 20,
  "hasNextPage": true,
  "results": [
    {
      "id": "6989b8a029cf95f4eb03b500",
      "title": { "romaji": "Sousou no Frieren", "preferred": "Frieren" },
      "cover_image": { "large": "https://..." },
      "episode": 28,
      "aired_at": "2024-03-22T16:00:00.000Z",
      "is_dub": false
    }
  ]
}
```

**Cache:** 60s client / 120s CDN.

---

### GET /anilist

Direct passthrough to AniList GraphQL, cached for 30 minutes. Exactly one of `id`, `search`, or `trending` must be provided.

| Param | Type | Description |
|-------|------|-------------|
| `id` | number | AniList media id → returns a single media object |
| `search` | string | Free-text search → returns up to 20 results |
| `trending` | `1` | Set to `1` → returns current trending anime list |

**Example:**

```bash
curl "https://your-deployment.example.com/api/scrape/anilist?id=154587"
curl "https://your-deployment.example.com/api/scrape/anilist?search=frieren"
curl "https://your-deployment.example.com/api/scrape/anilist?trending=1"
```

**Cache:** 300s-1800s depending on operation.

---

### GET /api/proxy/m3u8

CORS proxy for upstream m3u8 / segment / subtitle URLs. You usually don't call this directly — `/sources` returns pre-wrapped URLs.

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `url` | string (encoded) | yes | — | The absolute upstream URL to proxy |
| `format` | `m3u8` \| `vtt` | no | auto | Hint the response type |
| `referer` | string (encoded) | no | auto | Override the Referer header sent upstream |

**Behavior:**

1. Fetches the upstream URL with a browser User-Agent and the appropriate Referer (`animetsu.live` by default, `anikuro.ru` if URL contains `anikuro.ru`, or your custom referer).
2. If response is an m3u8 playlist: rewrites every line so segment URLs and `#EXT-X-KEY URI` tags point back at this proxy.
3. If response is a VTT subtitle: returns with `text/vtt` content-type.
4. Otherwise: streams the binary (TS/fMP4) with `Access-Control-Allow-Origin: *`.

**Example:**

```bash
curl "https://your-deployment.example.com/api/proxy/m3u8?url=https%3A%2F%2Fswiftstream.top%2Fmaster.m3u8"

# For anikuro streams that need a custom referer:
curl "https://your-deployment.example.com/api/proxy/m3u8?url=https%3A%2F%2Fcdn.mewstream.buzz%2Fmaster.m3u8&referer=https%3A%2F%2Fanikuro.ru%2F"
```

---

## TypeScript Types

```typescript
export type ProviderId = "animetsu" | "anikuro" | "animeyubi";

export interface UnifiedSearchResult {
  id: string;
  anilistId?: number;
  malId?: number;
  title: {
    romaji?: string;
    english?: string;
    native?: string;
    preferred?: string;
  };
  coverImage?: {
    cover?: string;
    banner?: string;
    large?: string;
    medium?: string;
    small?: string;
    color?: string;
  };
  banner?: string;
  description?: string;
  status?: string;
  year?: number;
  format?: string;
  genres?: string[];
  averageScore?: number;
  totalEpisodes?: number | null;
  isAdult?: boolean;
  duration?: number;
  season?: string;
}

export interface UnifiedEpisode {
  number: number;
  displayNumber?: string;
  sourceId: string;
  title?: string;
  description?: string;
  thumbnail?: string;
  image?: string;
  airedAt?: string;
  duration?: number;
  filler?: boolean;
  variants?: string[]; // ["sub"] | ["sub", "dub"]
}

export interface UnifiedStreamSource {
  url: string;            // Proxy-ready URL
  type: "hls" | "mp4" | "master" | "iframe";
  quality?: string;
  isMaster?: boolean;
  originalUrl?: string;
  upstreamReferer?: string;
}

export interface UnifiedSubtitle {
  url: string;
  lang: string;
}

export interface UnifiedSkipMarkers {
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
}

export interface UnifiedSources {
  sources: UnifiedStreamSource[];
  subtitles: UnifiedSubtitle[];
  skips?: UnifiedSkipMarkers;
  server: string;
  provider: ProviderId;
  qualities?: { label: string; resolution: string; url: string }[];
  raw?: unknown;
  rawMulti?: Record<string, unknown>;
}
```

---

## Errors

All errors follow a consistent JSON shape:

```json
{ "error": "Missing id or ep." }
```

| Status | Meaning | When |
|--------|---------|------|
| `400` | Bad Request | Missing required query param |
| `404` | Not Found | Anime id doesn't exist on the provider |
| `502` | Bad Gateway | Upstream provider returned an error or timed out |

---

## Changelog

### v1.2.0 — 2026-06-27
- Added `animeyubi` provider (AnimePahe mirror with kwik.cx iframe embeds)
- Added `iframe` source type for CF-protected embeds
- Added `/api/scrape/raw` endpoint for upstream response inspection
- Added `upstreamReferer` field on stream sources

### v1.1.0 — 2026-06-15
- Added `anikuro` provider with 11 upstream providers
- AniList enrichment auto-triggered when provider exposes anilistId

### v1.0.0 — 2026-05-01
- Initial release with `animetsu` provider, CORS proxy, and AniList integration
