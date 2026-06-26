/**
 * Miruro provider — wraps https://www.miruro.to/
 *
 * Miruro is a streaming-frontend that proxies ALL of its data requests through
 * a single encrypted endpoint at `/api/secure/pipe`. The pipeline is:
 *
 *   1. Client builds an envelope:  { path, method, query, body, version }
 *   2. Encodes it as base64url and sends it as ?e=<envelope> on a GET
 *      (POST is used for non-GET methods, with a JWE-encrypted body — we
 *      don't need POST for any of the public endpoints.)
 *   3. Server returns base64url-encoded bytes. When the `x-obfuscated: 2`
 *      response header is set, those bytes are first XORed with a static
 *      16-byte obfuscation key (VITE_PIPE_OBF_KEY), then gunzipped.
 *   4. The decompressed payload is JSON.
 *
 * The obfuscation key is shipped in the page's /env2.js, so it's not really
 * "secret" — it's just an anti-scraping hurdle. We hard-code it here.
 *
 * API surface (all GET via /api/secure/pipe?e=<envelope>):
 *   config              → provider capabilities (which providers exist, sub/dub)
 *   search?search=...   → AniList-style search results
 *   info/anilist/<id>   → full anime document (AniList-enriched)
 *   episodes?anilistId=<id>   → episode list, grouped by provider × audio
 *   sources?episodeId=<id>&provider=<name>&category=<sub|dub>  → playable URLs
 *
 * Stream types returned:
 *   - "hls"    → direct m3u8 URL with a referer header (route via /api/proxy/m3u8)
 *   - "embed"  → CF-protected embed page (render in <iframe>)
 */

import type {
  Provider,
  UnifiedSearchResult,
  UnifiedEpisode,
  UnifiedServer,
  UnifiedSources,
  UnifiedStreamSource,
} from "./types";

const MIRURO_BASE = process.env.MIRURO_BASE || "https://www.miruro.to";
const PROTOCOL_VERSION = "0.2.0";

/** Static obfuscation key from /env2.js — XOR'd against the response bytes. */
const PIPE_OBF_KEY = Buffer.from(
  "71951034f8fbcf53d89db52ceb3dc22c",
  "hex"
);

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** In-process cache so we don't repeat the episodes call for every source fetch. */
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
  if (cache.size > 500) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  return v;
}

/* ------------------------------------------------------------------ */
/*  Envelope encoding + response decoding                              */
/* ------------------------------------------------------------------ */

interface Envelope {
  path: string;
  method: "GET" | "POST";
  query: Record<string, string | undefined>;
  body: null;
  version: string;
}

/** base64url-encode a JSON envelope (no padding). */
function encodeEnvelope(env: Envelope): string {
  const json = JSON.stringify(env);
  return Buffer.from(json, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Decode miruro's obfuscated response:
 *   base64url → bytes → (XOR with PIPE_OBF_KEY if obfuscated) → gunzip → JSON
 */
function decodePipeResponse(body: string, obfuscated: boolean): unknown {
  // base64url → bytes
  const padded = body + "=".repeat((4 - (body.length % 4)) % 4);
  let bytes = Buffer.from(padded, "base64");

  // XOR with the static obfuscation key
  if (obfuscated) {
    const unxor = Buffer.allocUnsafe(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      unxor[i] = bytes[i] ^ PIPE_OBF_KEY[i % PIPE_OBF_KEY.length];
    }
    bytes = unxor;
  }

  // gzip decompress (magic 1f 8b)
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const zlib = require("zlib");
    bytes = zlib.gunzipSync(bytes);
  }

  const text = bytes.toString("utf-8");
  return JSON.parse(text);
}

/** Fire a GET request through miruro's secure pipe. */
async function pipeGet<T>(path: string, query: Record<string, string | undefined> = {}): Promise<T | null> {
  // Strip undefined values
  const cleanQuery: Record<string, string> = {};
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") cleanQuery[k] = String(v);
  }

  const envelope = encodeEnvelope({
    path,
    method: "GET",
    query: cleanQuery,
    body: null,
    version: PROTOCOL_VERSION,
  });

  const url = `${MIRURO_BASE}/api/secure/pipe?e=${envelope}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        Referer: `${MIRURO_BASE}/`,
        Origin: MIRURO_BASE,
        Accept: "*/*",
      },
      cache: "no-store",
    });
    if (!res.ok) return null;

    const text = await res.text();
    const obfuscated = res.headers.get("x-obfuscated") === "2";
    return decodePipeResponse(text, obfuscated) as T;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Provider implementation                                            */
/* ------------------------------------------------------------------ */

export const miruroProvider: Provider = {
  meta: {
    id: "miruro",
    label: "Miruro",
    description: "AniList-native · 7 streaming providers · Sub/Dub · Skip markers",
    accent: "from-sky-500 to-indigo-500",
    supportsDub: true,
    defaultServer: "bonk",
  },

  async search(query: string): Promise<UnifiedSearchResult[]> {
    if (!query.trim()) return [];
    const payload = await pipeGet<MiruroSearchPayload>("search", { search: query });
    const items = Array.isArray(payload) ? payload : payload?.results || [];
    return items.map((m) => ({
      id: `al:${m.id}`, // miruro uses AniList IDs — prefix to disambiguate
      anilistId: m.id,
      malId: m.idMal,
      title: {
        romaji: m.title?.romaji,
        english: m.title?.english,
        native: m.title?.native,
        preferred: m.title?.userPreferred,
      },
      coverImage: {
        large: m.coverImage?.large,
        medium: m.coverImage?.medium,
        small: m.coverImage?.medium,
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
      isAdult: m.isAdult,
      duration: m.duration,
      season: m.season,
    }));
  },

  async getInfo(id: string): Promise<UnifiedSearchResult | null> {
    const anilistId = parseAnilistId(id);
    if (!anilistId) return null;
    const m = await pipeGet<MiruroInfo>(`info/anilist/${anilistId}`);
    if (!m) return null;
    return {
      id: `al:${m.id}`,
      anilistId: m.id,
      malId: m.idMal,
      title: {
        romaji: m.title?.romaji,
        english: m.title?.english,
        native: m.title?.native,
        preferred: m.title?.userPreferred,
      },
      coverImage: {
        large: m.coverImage?.large,
        medium: m.coverImage?.medium,
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
      isAdult: m.isAdult,
      duration: m.duration,
      season: m.season,
    };
  },

  async getEpisodes(id: string): Promise<UnifiedEpisode[]> {
    const episodesDoc = await fetchEpisodesDoc(id);
    if (!episodesDoc?.providers) return [];

    // Use the first provider that has sub episodes (preference order from config).
    // Miruro returns episodes grouped per provider; we pick one and surface its
    // episode list. The user can switch providers via /servers + /sources.
    const providerOrder = ["bonk", "ally", "pewe", "moo", "bee", "kiwi", "hop"];
    const variants = ["sub", "dub"] as const;

    for (const providerName of providerOrder) {
      const prov = episodesDoc.providers[providerName];
      if (!prov?.episodes) continue;
      for (const variant of variants) {
        const eps = prov.episodes[variant];
        if (Array.isArray(eps) && eps.length > 0) {
          return eps.map((e) => ({
            number: e.number,
            displayNumber: String(e.number),
            // Source id encodes everything getSources needs to find this episode
            // across any provider: anilistId + episodeId + provider + audio.
            sourceId: `${id}|${e.id}|${providerName}|${variant}`,
            title: e.title,
            description: e.description,
            thumbnail: e.image,
            image: e.image,
            airedAt: e.airDate,
            duration: e.duration ? Math.round(e.duration / 60) : undefined, // s → min
            filler: e.filler,
            variants: prov.episodes.dub ? ["sub", "dub"] : ["sub"],
          }));
        }
      }
    }
    return [];
  },

  async getServers(id: string): Promise<UnifiedServer[]> {
    const episodesDoc = await fetchEpisodesDoc(id);
    if (!episodesDoc?.providers) return [];

    // Each provider IS a server from the UI's perspective.
    return Object.entries(episodesDoc.providers)
      .filter((entry): entry is [string, MiruroProviderEpisodes] =>
        Boolean(entry[1]?.episodes && Object.keys(entry[1].episodes).length > 0)
      )
      .map(([name, p], i) => {
        const variants = Object.keys(p.episodes || {});
        const audios = variants.filter((v) => v === "sub" || v === "dub").join("/");
        return {
          id: name,
          label: `${name} · ${audios}`,
          description: p.meta?.title ? `${p.meta.totalEpisodes} eps` : "Auto fallback",
          default: i === 0,
        };
      });
  },

  async getSources(opts): Promise<UnifiedSources> {
    const { id, epNum, server, sourceType = "sub" } = opts;

    // Resolve the episode's miruro episodeId by looking it up in the episodes doc.
    const episodeInfo = await findEpisode(id, epNum);
    if (!episodeInfo) {
      return {
        sources: [],
        subtitles: [],
        server: server || "auto",
        provider: "miruro",
      };
    }

    // Determine which provider + audio variant to use.
    // If a specific server was requested, use it; otherwise prefer the one that
    // actually has this episode in the requested audio variant.
    const providerName = server && server !== "auto" && server !== "default"
      ? server
      : episodeInfo.provider;

    const audio = (sourceType === "dub" ? "dub" : "sub");

    const payload = await pipeGet<MiruroSourcesResponse>("sources", {
      episodeId: episodeInfo.episodeId,
      provider: providerName,
      category: audio,
    });

    if (!payload) {
      return {
        sources: [],
        subtitles: [],
        server: providerName,
        provider: "miruro",
      };
    }

    // Build unified stream sources. Miruro returns HLS URLs with a referer
    // header — route them through our CORS proxy with that referer.
    const streams = payload.streams || [];
    const sources: UnifiedStreamSource[] = [];

    for (const s of streams) {
      if (!s.url) continue;
      const isHls = s.type === "hls" || s.url.includes(".m3u8");
      const isEmbed = s.type === "embed" || /\/embed\//i.test(s.url);
      const referer = s.referer || `${MIRURO_BASE}/`;

      if (isEmbed) {
        sources.push({
          url: s.url,
          type: "iframe",
          quality: "default",
          originalUrl: s.url,
          upstreamReferer: referer,
        });
      } else if (isHls) {
        const proxied = `/api/proxy/m3u8?url=${encodeURIComponent(s.url)}&referer=${encodeURIComponent(referer)}`;
        sources.push({
          url: proxied,
          type: "master",
          quality: "auto",
          isMaster: true,
          originalUrl: s.url,
          upstreamReferer: referer,
        });
      } else {
        // MP4 or unknown — proxy with the referer just in case
        const proxied = `/api/proxy/m3u8?url=${encodeURIComponent(s.url)}&referer=${encodeURIComponent(referer)}`;
        sources.push({
          url: proxied,
          type: s.type === "mp4" ? "mp4" : "hls",
          quality: s.quality || "default",
          originalUrl: s.url,
          upstreamReferer: referer,
        });
      }
    }

    // Surface the raw payload for the "Show raw response" panel.
    const rawPayload = {
      provider: "miruro",
      api: `${MIRURO_BASE}/api/secure/pipe (path=sources)`,
      animeId: id,
      episodeId: episodeInfo.episodeId,
      episodeNumber: epNum,
      streamType: audio,
      server: providerName,
      upstream: payload,
      // Normalize into the user's preferred MegaPlay-style format so the raw
      // panel shows hls_url / mp4_url / embed_url fields consistently.
      normalized: streams.map((s) => ({
        anilist_id: parseAnilistId(id),
        episode: epNum,
        stream_type: audio,
        provider: providerName,
        server_id: s.server || providerName,
        cdn_host: extractHost(s.url),
        hls_url: s.type === "hls" || s.url.includes(".m3u8") ? s.url : null,
        mp4_url: s.type === "mp4" ? s.url : null,
        embed_url: s.type === "embed" || /\/embed\//i.test(s.url) ? s.url : null,
        stream_format: s.type,
        quality: s.quality || "auto",
        referer: s.referer || null,
        is_default: s.default === true,
      })),
    };

    return {
      sources,
      subtitles: [],
      server: providerName,
      provider: "miruro",
      raw: rawPayload,
    };
  },
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Parse the AniList ID out of our `al:<id>` source id format. */
function parseAnilistId(id: string): number | null {
  if (id.startsWith("al:")) {
    const n = Number(id.slice(3));
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(id);
  return Number.isFinite(n) ? n : null;
}

/** Fetch and cache the episodes document (which also lists providers + episodes). */
async function fetchEpisodesDoc(id: string): Promise<MiruroEpisodesDoc | null> {
  const anilistId = parseAnilistId(id);
  if (!anilistId) return null;
  const cacheKey = `episodes:${anilistId}`;
  const cached = cacheGet<MiruroEpisodesDoc>(cacheKey);
  if (cached) return cached;

  const doc = await pipeGet<MiruroEpisodesDoc>("episodes", {
    anilistId: String(anilistId),
  });
  if (!doc) return null;
  return cacheSet(cacheKey, doc);
}

/** Find the episode + provider to use for a given (animeId, epNum). */
async function findEpisode(
  id: string,
  epNum: number
): Promise<{ episodeId: string; provider: string; audio: "sub" | "dub" } | null> {
  const doc = await fetchEpisodesDoc(id);
  if (!doc?.providers) return null;

  const providerOrder = ["bonk", "ally", "pewe", "moo", "bee", "kiwi", "hop"];

  for (const providerName of providerOrder) {
    const prov = doc.providers[providerName];
    if (!prov?.episodes) continue;
    // Prefer sub, fall back to dub if the provider doesn't have subs
    for (const audio of ["sub", "dub"] as const) {
      const eps = prov.episodes[audio];
      if (!Array.isArray(eps)) continue;
      const ep = eps.find((e) => e.number === epNum);
      if (ep) {
        return { episodeId: ep.id, provider: providerName, audio };
      }
    }
  }
  return null;
}

/** Extract the hostname for the normalized raw payload. */
function extractHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

/* ------------------------------------------------------------------ */
/*  Upstream type shapes (only what we read)                          */
/* ------------------------------------------------------------------ */

interface MiruroSearchItem {
  id: number;
  idMal?: number;
  title?: { native?: string; romaji?: string; english?: string; userPreferred?: string };
  coverImage?: { color?: string; large?: string; medium?: string; small?: string; extraLarge?: string };
  bannerImage?: string;
  format?: string;
  status?: string;
  episodes?: number;
  averageScore?: number;
  meanScore?: number;
  popularity?: number;
  startDate?: { day?: number; month?: number; year?: number };
  seasonYear?: number;
  description?: string;
  genres?: string[];
  duration?: number;
  isAdult?: boolean;
  season?: string;
  nextAiringEpisode?: { episode?: number; airingAt?: number; timeUntilAiring?: number } | null;
}

interface MiruroSearchPayload {
  results?: MiruroSearchItem[];
}

type MiruroInfo = MiruroSearchItem & {
  trailer?: { id: string; site: string; thumbnail?: string };
  countryOfOrigin?: string;
  endDate?: { day?: number; month?: number; year?: number };
};

interface MiruroEpisode {
  id: string;
  number: number;
  title?: string;
  duration?: number; // seconds
  description?: string;
  filler?: boolean;
  uncensored?: boolean;
  audio?: string;
  image?: string;
  airDate?: string;
}

interface MiruroProviderEpisodes {
  meta?: { id?: string; title?: string; totalEpisodes?: number };
  episodes: {
    sub?: MiruroEpisode[];
    dub?: MiruroEpisode[];
    ssub?: MiruroEpisode[];
    es?: MiruroEpisode[];
    [lang: string]: MiruroEpisode[] | undefined;
  };
}

interface MiruroEpisodesDoc {
  mappings: {
    id: number;
    title?: string;
    type?: string;
    format?: string;
    episodes?: number;
    malId?: number;
    aniId?: number;
    anidbId?: number;
    [key: string]: unknown;
  };
  providers: Record<string, MiruroProviderEpisodes | undefined>;
}

interface MiruroStream {
  url: string;
  type: "hls" | "mp4" | "embed" | string;
  referer?: string;
  server?: string;
  quality?: string;
  default?: boolean;
  isActive?: boolean;
}

interface MiruroSourcesResponse {
  streams: MiruroStream[];
}
