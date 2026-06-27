/**
 * Animex provider — wraps https://animex.one/
 *
 * Animex is a SvelteKit SPA that proxies ALL of its data through SvelteKit's
 * server-side `__data.json` endpoints. There is no `/api/*` surface — every
 * request returns an SSR-rendered JSON blob containing the page's data plus
 * zero or more "chunks" (deferred promises resolved server-side).
 *
 * What animex actually does:
 *   - Anime metadata + search: pulled directly from AniList GraphQL
 *     (we delegate to our existing /api/scrape/anilist route via the
 *     @/lib/anilist/client module — no need to hit animex for search).
 *   - Episode stream URLs: animex wraps https://flixcloud.cc/ as their video
 *     embed provider. Each episode has an `access_id` that maps to a
 *     `https://flixcloud.cc/e/{access_id}?v=1` embed URL.
 *
 * Route layout (slug prefix is ignored by SvelteKit — only the trailing
 * `-{anilistId}` and `-episode-{N}` segments matter):
 *   /anime/x-{anilistId}                        → anime metadata
 *   /watch/x-{anilistId}-episode-{N}            → episode chunk with access_id
 *
 * Episode discovery strategy:
 *   - Get expected episode count from AniList (cap at 24 for safety)
 *   - Hit /watch/x-{anilistId}-episode-{N}/__data.json for each episode in
 *     parallel (batch of 12)
 *   - Parse the SvelteKit chunk and extract {access_id, audio, episode, player_url}
 *   - Episodes with empty `data` arrays are skipped (not yet released)
 *
 * Audio variants:
 *   - "dual"   → both sub and dub available (variants: ["sub", "dub"])
 *   - "native" → sub only (variants: ["sub"])
 *   - "sub"    → sub only (variants: ["sub"])
 *
 * Stream playback:
 *   - We return the flixcloud embed URL as an iframe source.
 *   - The flixcloud page uses ArtPlayer + Crypto-JS to decrypt the actual m3u8
 *     at runtime. Extracting the m3u8 server-side would be fragile.
 *   - BONUS: the flixcloud embed HTML contains subtitles + chapter markers
 *     (intro/outro) that we extract and return alongside the iframe.
 */

import type {
  Provider,
  UnifiedSearchResult,
  UnifiedEpisode,
  UnifiedServer,
  UnifiedSources,
  UnifiedStreamSource,
  UnifiedSubtitle,
  UnifiedSkipMarkers,
} from "./types";
import { searchAniList, getAniListMedia, type AniListMedia } from "@/lib/anilist/client";

const ANIMEX_BASE = "https://animex.one";
const FLIXCLOUD_BASE = "https://flixcloud.cc";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** Hard cap on episodes to probe in parallel — protects animex from hammering. */
const MAX_EPISODES_TO_PROBE = 24;
/** Parallelism for episode probing. */
const EPISODE_PROBE_CONCURRENCY = 12;

/** In-process cache for episode lists (5min TTL) — episode discovery is expensive. */
const cache = new Map<string, { t: number; v: unknown }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function cacheGet<T>(key: string): T | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.t > CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return hit.v as T;
}

function cacheSet<T>(key: string, v: T): T {
  cache.set(key, { t: Date.now(), v });
  if (cache.size > 200) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  return v;
}

/* ------------------------------------------------------------------ */
/*  SvelteKit __data.json parsing                                       */
/* ------------------------------------------------------------------ */

/** Raw shape of a single episode entry inside animex's chunk. */
interface AnimexEpisodeChunk {
  access_id: string;
  imdb: string | null;
  audio: "dual" | "native" | "sub" | string;
  anilist_id: number;
  mal_id: number | null;
  tmdb_id: number | null;
  tmdb_season: number | null;
  episode: number;
  player_url: string;
}

/**
 * Parse a SvelteKit __data.json response and return the first chunk's
 * resolved episode data, or null if the episode doesn't exist.
 *
 * SvelteKit chunk protocol:
 *   - The response contains 1+ top-level JSON objects concatenated.
 *   - The "data" object holds the page's main load() return value.
 *   - Each "chunk" object holds a deferred Promise's resolved value.
 *   - Chunks use devalue format: integers INSIDE dicts/lists are indices
 *     into the chunk's flat `data` array. The value at data[i] is the
 *     final value (recursively deref if it's a dict/list).
 */
function parseEpisodeChunk(raw: string): AnimexEpisodeChunk | null {
  // Split the response into top-level JSON objects.
  const objects: string[] = [];
  let depth = 0;
  let start = 0;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') {
      inStr = true;
    } else if (c === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0) objects.push(raw.slice(start, i + 1));
    }
  }

  for (const objStr of objects) {
    let obj: { type?: string; data?: unknown[] };
    try {
      obj = JSON.parse(objStr);
    } catch {
      continue;
    }
    if (obj.type !== "chunk" || !Array.isArray(obj.data) || obj.data.length === 0) continue;

    const data = obj.data;
    const root = data[0] as Record<string, unknown> | null;
    if (!root || typeof root !== "object" || !("data" in root)) continue;

    const episodesArr = deref((root as Record<string, unknown>).data, data);
    if (Array.isArray(episodesArr) && episodesArr.length > 0) {
      const ep = episodesArr[0] as Record<string, unknown>;
      if (ep && typeof ep === "object" && "access_id" in ep) {
        return ep as unknown as AnimexEpisodeChunk;
      }
    }
  }
  return null;
}

/**
 * Devalue dereferencing: integers found INSIDE dicts/lists are indices into
 * `data`. The value at data[i] is the final value (recursively deref if it's
 * a dict/list, return as-is if it's a primitive).
 */
function deref(value: unknown, data: unknown[]): unknown {
  if (typeof value === "number" && Number.isInteger(value)) {
    if (value >= 0 && value < data.length) {
      const inner = data[value];
      if (inner !== null && typeof inner === "object") {
        if (Array.isArray(inner)) {
          return inner.map((v) => deref(v, data));
        }
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(inner as Record<string, unknown>)) {
          out[k] = deref(v, data);
        }
        return out;
      }
      return inner; // primitive — final value
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => deref(v, data));
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = deref(v, data);
    }
    return out;
  }
  return value;
}

/* ------------------------------------------------------------------ */
/*  Animex fetch helpers                                                */
/* ------------------------------------------------------------------ */

/** Fetch an episode's access_id + audio + player_url from animex's watch page. */
async function fetchEpisodeChunk(
  anilistId: number,
  epNum: number,
  signal?: AbortSignal
): Promise<AnimexEpisodeChunk | null> {
  const url = `${ANIMEX_BASE}/watch/x-${anilistId}-episode-${epNum}/__data.json`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        Referer: `${ANIMEX_BASE}/`,
        Accept: "application/json,text/sveltekit-data,*/*;q=0.8",
      },
      cache: "no-store",
      signal,
    });
    if (!res.ok) return null;
    const text = await res.text();
    return parseEpisodeChunk(text);
  } catch {
    return null;
  }
}

/** Probe episodes 1..maxEps in parallel, returning all that exist. */
async function fetchAllEpisodes(
  anilistId: number,
  maxEps: number
): Promise<AnimexEpisodeChunk[]> {
  const cap = Math.min(maxEps, MAX_EPISODES_TO_PROBE);
  const results: AnimexEpisodeChunk[] = [];
  // Process in batches of EPISODE_PROBE_CONCURRENCY
  for (let i = 1; i <= cap; i += EPISODE_PROBE_CONCURRENCY) {
    const batch = [] as number[];
    for (let j = i; j < i + EPISODE_PROBE_CONCURRENCY && j <= cap; j++) {
      batch.push(j);
    }
    const settled = await Promise.all(
      batch.map((ep) => fetchEpisodeChunk(anilistId, ep))
    );
    for (const ep of settled) {
      if (ep) results.push(ep);
    }
  }
  // Sort by episode number ascending
  results.sort((a, b) => a.episode - b.episode);
  return results;
}

/* ------------------------------------------------------------------ */
/*  Flixcloud embed parsing                                             */
/* ------------------------------------------------------------------ */

interface FlixcloudEmbedData {
  subtitles: { url: string; language: string; format: string; default?: boolean }[];
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
  videoId?: string;
  thumbnailsVtt?: string;
}

/**
 * Fetch the flixcloud.cc embed page and extract subtitles + skip markers.
 *
 * NOTE: Flixcloud sits behind Cloudflare bot protection that does TLS
 * fingerprinting. Node's fetch (undici) gets 403'd, even with full browser
 * headers. The iframe still works fine in the browser (the browser makes
 * the request directly), so playback is unaffected — we just can't extract
 * subtitles/chapters server-side. When we hit the 403, we return null
 * gracefully and the player loads the iframe without our enriched metadata.
 *
 * To re-enable extraction in the future, options would be:
 *   - Use a Cloudflare-bypassing HTTP client (e.g. cyclotls / got-scraping)
 *   - Run a headless browser to fetch the page
 *   - Reverse-engineer the flixcloud player's API (the page decrypts the
 *     stream URL via Crypto-JS at runtime — the decryption key changes
 *     frequently and would be fragile to maintain)
 */
async function fetchFlixcloudData(
  accessId: string,
  signal?: AbortSignal
): Promise<FlixcloudEmbedData | null> {
  const url = `${FLIXCLOUD_BASE}/e/${accessId}?v=1`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        Referer: `${ANIMEX_BASE}/`,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Sec-Ch-Ua":
          '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "iframe",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "cross-site",
        "Upgrade-Insecure-Requests": "1",
      },
      cache: "no-store",
      signal,
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Extract subtitle entries: {url:"...",language:"...",format:"...",default:true|false}
    const subtitleRegex =
      /\{url:"([^"]+)",language:"([^"]+)",format:"([^"]+)"(?:,default:(true|false))?\}/g;
    const subtitles: FlixcloudEmbedData["subtitles"] = [];
    let m: RegExpExecArray | null;
    while ((m = subtitleRegex.exec(html)) !== null) {
      subtitles.push({
        url: m[1],
        language: m[2],
        format: m[3],
        default: m[4] === "true",
      });
    }

    // Extract intro/outro chapters
    let intro: FlixcloudEmbedData["intro"] | undefined;
    let outro: FlixcloudEmbedData["outro"] | undefined;
    const introMatch = html.match(
      /intro_chapter:\{start:(\d+),end:(\d+),title:"([^"]+)"\}/
    );
    if (introMatch) {
      intro = { start: Number(introMatch[1]), end: Number(introMatch[2]) };
    }
    const outroMatch = html.match(
      /outro_chapter:\{start:(\d+),end:(\d+),title:"([^"]+)"\}/
    );
    if (outroMatch) {
      outro = { start: Number(outroMatch[1]), end: Number(outroMatch[2]) };
    }

    const videoIdMatch = html.match(/video_id:"([0-9a-f-]+)"/);
    const thumbnailsMatch = html.match(/thumbnails_vtt:"([^"]+)"/);

    return {
      subtitles,
      intro,
      outro,
      videoId: videoIdMatch?.[1],
      thumbnailsVtt: thumbnailsMatch?.[1],
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  AniList helpers                                                     */
/* ------------------------------------------------------------------ */

function parseAnilistId(id: string): number | null {
  if (id.startsWith("al:")) {
    const n = Number(id.slice(3));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const n = Number(id);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function anilistToSearchResult(m: AniListMedia): UnifiedSearchResult {
  return {
    id: `al:${m.id}`,
    anilistId: m.id,
    malId: m.idMal,
    title: {
      romaji: m.title?.romaji,
      english: m.title?.english,
      native: m.title?.native,
      preferred: m.title?.english || m.title?.romaji,
    },
    coverImage: {
      large: m.coverImage?.large,
      color: m.coverImage?.color,
    },
    banner: m.bannerImage,
    description: m.description,
    status: m.status,
    year: m.seasonYear,
    format: m.format,
    genres: m.genres,
    averageScore: m.averageScore,
    totalEpisodes: m.episodes ?? null,
    isAdult: m.countryOfOrigin === "JP" && m.genres?.includes("Hentai"),
    duration: m.duration,
    season: m.season,
  };
}

/* ------------------------------------------------------------------ */
/*  Provider                                                            */
/* ------------------------------------------------------------------ */

export const animexProvider: Provider = {
  meta: {
    id: "animex",
    label: "Animex",
    description: "AniList-native catalog with flixcloud.cc embeds (sub + dual audio).",
    accent: "from-pink-500 to-rose-500",
    supportsDub: true,
    defaultServer: "flixcloud",
  },

  async search(query: string): Promise<UnifiedSearchResult[]> {
    const results = await searchAniList(query, 20);
    return results.map(anilistToSearchResult);
  },

  async getInfo(id: string): Promise<UnifiedSearchResult | null> {
    const anilistId = parseAnilistId(id);
    if (!anilistId) return null;
    const m = await getAniListMedia(anilistId);
    if (!m) return null;
    return anilistToSearchResult(m);
  },

  async getEpisodes(id: string): Promise<UnifiedEpisode[]> {
    const anilistId = parseAnilistId(id);
    if (!anilistId) return [];

    const cacheKey = `episodes:${anilistId}`;
    const cached = cacheGet<UnifiedEpisode[]>(cacheKey);
    if (cached) return cached;

    // Determine max episode count from AniList
    const media = await getAniListMedia(anilistId);
    const maxEps = media?.episodes ?? 12; // default to 12 if unknown

    const chunks = await fetchAllEpisodes(anilistId, maxEps);
    const episodes: UnifiedEpisode[] = chunks.map((c) => {
      const variants: string[] =
        c.audio === "dual" ? ["sub", "dub"] : ["sub"];
      return {
        number: c.episode,
        displayNumber: String(c.episode),
        // Source id encodes everything getSources needs:
        //   anilistId + access_id + audio
        sourceId: `${anilistId}|${c.access_id}|${c.audio}`,
        variants,
      };
    });

    return cacheSet(cacheKey, episodes);
  },

  async getServers(_id: string, _epNum: number): Promise<UnifiedServer[]> {
    // Animex only uses flixcloud.cc — single server.
    return [
      {
        id: "flixcloud",
        label: "Flixcloud",
        description: "Animex's primary embed provider (ArtPlayer + multi-audio).",
        default: true,
      },
    ];
  },

  async getSources(opts): Promise<UnifiedSources> {
    const { id, epNum, server } = opts;
    const anilistId = parseAnilistId(id);
    if (!anilistId) {
      return {
        sources: [],
        subtitles: [],
        server: server || "auto",
        provider: "animex",
      };
    }

    // Find the episode's access_id by looking it up in the episodes list.
    const episodes = await this.getEpisodes(id);
    const ep = episodes.find((e) => e.number === epNum);
    if (!ep) {
      return {
        sources: [],
        subtitles: [],
        server: server || "auto",
        provider: "animex",
      };
    }

    // sourceId format: "{anilistId}|{access_id}|{audio}"
    const [_anilistId, accessId, audio] = ep.sourceId.split("|");
    if (!accessId) {
      return {
        sources: [],
        subtitles: [],
        server: server || "auto",
        provider: "animex",
      };
    }

    const embedUrl = `${FLIXCLOUD_BASE}/e/${accessId}?v=1`;

    // Fetch the flixcloud embed to extract subtitles + skip markers.
    const flixData = await fetchFlixcloudData(accessId);

    // Build the iframe source.
    const sources: UnifiedStreamSource[] = [
      {
        url: embedUrl,
        type: "iframe",
        quality: "auto",
        originalUrl: embedUrl,
        upstreamReferer: `${ANIMEX_BASE}/`,
      },
    ];

    // Convert flixcloud subtitles to our unified format.
    // Prefer .srt over .ass (browser HLS players handle SRT natively, ASS
    // requires a libass renderer). Keep both so the UI can pick.
    const subtitles: UnifiedSubtitle[] = (flixData?.subtitles || [])
      .filter((s) => s.format === "srt" || s.format === "ass")
      .map((s) => ({
        url: s.url,
        lang: s.language,
      }));

    // Skip markers from flixcloud chapters
    const skips: UnifiedSkipMarkers | undefined =
      flixData?.intro || flixData?.outro
        ? {
            intro: flixData?.intro,
            outro: flixData?.outro,
          }
        : undefined;

    // Raw payload for the "Show raw response" panel
    const rawPayload = {
      provider: "animex",
      api: `${ANIMEX_BASE}/watch/x-${anilistId}-episode-${epNum}/__data.json + ${FLIXCLOUD_BASE}/e/${accessId}?v=1`,
      animeId: id,
      episodeNumber: epNum,
      server: "flixcloud",
      audio,
      accessId,
      embedUrl,
      videoId: flixData?.videoId,
      thumbnailsVtt: flixData?.thumbnailsVtt,
      upstream: {
        access_id: accessId,
        audio,
        anilist_id: anilistId,
        episode: epNum,
        player_url: embedUrl,
      },
      subtitles: flixData?.subtitles,
      chapters: {
        intro: flixData?.intro,
        outro: flixData?.outro,
      },
      normalized: {
        anilist_id: anilistId,
        episode: epNum,
        stream_type: audio === "dual" ? "dual" : "sub",
        provider: "flixcloud",
        server_id: "flixcloud",
        cdn_host: FLIXCLOUD_BASE.replace(/^https?:\/\//, ""),
        hls_url: null,
        mp4_url: null,
        embed_url: embedUrl,
        stream_format: "iframe",
        quality: "auto",
        referer: `${ANIMEX_BASE}/`,
        is_default: true,
      },
    };

    return {
      sources,
      subtitles,
      skips,
      server: server || "flixcloud",
      provider: "animex",
      raw: rawPayload,
    };
  },
};
