/**
 * Anilight provider — wraps https://anilight.live/
 *
 * Anilight is a React SPA that proxies ALL of its data through a public REST
 * API at https://api.anilight.live/api. Episode streams are served by
 * https://megaplay.buzz/ (a JW Player-based host with its own JSON API).
 *
 * API surface (all GET, all Cloudflare-fronted):
 *   GET /api/search?q={query}                       → array of anime (slug + anilistId)
 *   GET /api/anime/{slug}                            → full anime document
 *   GET /api/anime/{slug}/extra                      → characters + relations
 *   GET /api/watch/{slug}                            → episode list with embed_url.{sub,dub}
 *   GET /api/watch/{slug}/extra                      → recommendations
 *   GET /api/homepage                                → trending/seasonal carousel data
 *   GET /api/filter?q=...&page=N                     → paginated browse
 *
 * Cloudflare note:
 *   api.anilight.live sits behind Cloudflare bot management — Node's undici
 *   (global fetch) gets 403'd by TLS fingerprinting. We shell out to curl
 *   for those calls (curl with full browser headers sails through). The
 *   pattern mirrors flixcloud-extract.ts.
 *
 * Stream extraction pipeline (megaplay.buzz):
 *   1. From anilight's watch doc, each episode has:
 *        embed_url.sub = "https://megaplay.buzz/stream/s-2/{realid}/sub"
 *        embed_url.dub = "https://megaplay.buzz/stream/s-2/{realid}/dub"   (when available)
 *      The {realid} is the trailing numeric path segment.
 *
 *   2. GET https://megaplay.buzz/api/{realid}     (X-Requested-With: XMLHttpRequest)
 *      Returns the episode's stream metadata. The response is an array of
 *      variants, each with a `type` ("sub" | "dub" | "hsub"), an `episode_id`,
 *      and an `embed_id`. We pick the variant matching the requested audio.
 *
 *   3. GET https://megaplay.buzz/stream/getSourcesNew?id={episode_id}
 *      Returns the actual stream payload:
 *        {
 *          "sources":  { "file": "https://*.nekostream.site/.../master.m3u8" },
 *          "tracks":   [{ "file": "...vtt", "label": "English", "kind": "captions" }],
 *          "intro":    { "start": 111, "end": 199 },
 *          "outro":    { "start": 1344, "end": 1440 },
 *          "server":   5
 *        }
 *
 *   4. The m3u8 URL is on `*.nekostream.site` and is Cloudflare-fronted —
 *      every request (master, variant, segment, subtitle) MUST be sent with
 *      `Referer: https://megaplay.buzz/` or Cloudflare returns a 403
 *      "Attention Required!" challenge page. We route the m3u8 through
 *      /api/proxy/m3u8?url=<m3u8>&referer=https://megaplay.buzz/ — the proxy
 *      handles referer injection, segment URL rewriting, and range requests.
 *
 * ID format:
 *   We use `al:{anilistId}:{slug}` — encodes both the AniList id (for
 *   display / cross-provider compatibility) and the anilight slug (for
 *   direct API calls without a lookup). When given a bare `al:{anilistId}`
 *   (e.g. from a saved bookmark), we fall back to searching by anilist id
 *   via our cached slug map.
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
import { execFileSync } from "node:child_process";

const ANILIGHT_API = "https://api.anilight.live/api";
const MEGAPLAY_BASE = "https://megaplay.buzz";
const MEGAPLAY_REFERER = "https://megaplay.buzz/";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** In-process cache so we don't repeat the episodes call for every source fetch. */
const cache = new Map<string, { t: number; v: unknown }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

/** anilistId → slug map, populated by search() so subsequent getInfo/al: lookups work. */
const slugByAnilistId = new Map<number, string>();

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
/*  Curl-backed HTTP (Cloudflare bypass for api.anilight.live)         */
/* ------------------------------------------------------------------ */

/**
 * Curl-backed GET — Node's undici gets 403'd by Cloudflare's TLS
 * fingerprinting on api.anilight.live, but curl with full browser
 * headers sails through. Used for every anilight API call.
 */
function curlGetJSON<T>(url: string): T | null {
  const args = [
    "-sSL",
    "-A", BROWSER_UA,
    "-H", `Referer: https://anilight.live/`,
    "-H", `Origin: https://anilight.live`,
    "-H", "Accept: application/json,text/plain,*/*;q=0.8",
    "-H", "Accept-Language: en-US,en;q=0.9",
    "-H", 'Sec-Ch-Ua: "Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    "-H", "Sec-Ch-Ua-Mobile: ?0",
    "-H", 'Sec-Ch-Ua-Platform: "Windows"',
    "-H", "Sec-Fetch-Dest: empty",
    "-H", "Sec-Fetch-Mode: cors",
    "-H", "Sec-Fetch-Site: cross-site",
    "--max-time", "15",
    "-w", "\n__HTTP_STATUS__%{http_code}",
    url,
  ];
  let out: string;
  try {
    out = execFileSync("curl", args, {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (err) {
    return null;
  }
  const m = out.match(/__HTTP_STATUS__(\d+)\s*$/);
  const status = m ? parseInt(m[1], 10) : 0;
  const body = m ? out.slice(0, m.index) : out;
  if (status !== 200) return null;
  try {
    return JSON.parse(body) as T;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  MegaPlay API (Cloudflare-friendly, Node fetch works fine)         */
/* ------------------------------------------------------------------ */

interface MegaplayVariant {
  episode_id: number;
  anime_id: number;
  ep_id: number;
  title: string;
  type: "sub" | "dub" | "hsub" | string;
  id: number;
  embed_id: string;
  cdn: boolean;
  media_id: number;
}

interface MegaplayEpisodeListResponse {
  success: number;
  data: MegaplayVariant[];
}

interface MegaplaySourcesResponse {
  sources: { file: string };
  tracks?: { file: string; label: string; kind: string; default?: boolean }[];
  t?: number;
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
  server?: number;
}

/**
 * Fetch the episode's variants (sub/dub/hsub) from megaplay.buzz.
 * Returns null on any error.
 */
async function fetchMegaplayVariants(realid: number): Promise<MegaplayVariant[] | null> {
  const url = `${MEGAPLAY_BASE}/api/${realid}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        Referer: `${MEGAPLAY_BASE}/stream/s-2/${realid}/sub`,
        "X-Requested-With": "XMLHttpRequest",
        Accept: "application/json, text/javascript, */*; q=0.01",
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as MegaplayEpisodeListResponse;
    if (!json || !Array.isArray(json.data)) return null;
    return json.data;
  } catch {
    return null;
  }
}

/**
 * Fetch the actual stream payload (m3u8 URL, subtitles, skip markers) from
 * megaplay.buzz's getSourcesNew endpoint.
 */
async function fetchMegaplaySources(episodeId: number): Promise<MegaplaySourcesResponse | null> {
  const url = `${MEGAPLAY_BASE}/stream/getSourcesNew?id=${episodeId}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        Referer: "https://anilight.live/",
        "X-Requested-With": "XMLHttpRequest",
        Accept: "application/json, text/javascript, */*; q=0.01",
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as MegaplaySourcesResponse;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Anilight API types                                                 */
/* ------------------------------------------------------------------ */

interface AnilightTitle {
  romaji?: string;
  english?: string;
  native?: string;
}

interface AnilightCoverImage {
  large?: string;
  extraLarge?: string;
  medium?: string;
  color?: string | null;
}

interface AnilightAnime {
  id: number;
  slug: string;
  anilistId: number;
  idMal?: number;
  title: AnilightTitle;
  coverImage: AnilightCoverImage;
  bannerImage?: string;
  description?: string;
  genres?: string[];
  averageScore?: number;
  popularity?: number;
  episodes?: number;
  duration?: number;
  status?: string;
  source?: string;
  season?: string;
  seasonYear?: number;
  startDate?: { year?: number; month?: number; day?: number };
  format?: string;
  trailer?: { id: string; site: string };
  studios?: { nodes: { id: number; name: string }[] };
  nextAiringEpisode?: { episode: number; airingAt: number; timeUntilAiring: number } | null;
  tmdb?: { id: number; title: string; poster: string; backdrop: string };
}

interface AnilightEpisode {
  number: number;
  title?: string;
  jp_title?: string;
  description?: string;
  img?: string;
  isFiller?: boolean;
  airedAt?: string;
  duration?: number;
  /** Each episode has sub always, dub when present. */
  embed_url: {
    sub?: string;
    dub?: string;
  };
}

interface AnilightWatchResponse {
  id: number;
  episodes: AnilightEpisode[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Parse the AniLight id. Accepted formats:
 *   - "al:{anilistId}:{slug}"  → returns both
 *   - "al:{anilistId}"         → returns anilistId, slug from cache (or null)
 *   - "{slug}"                  → returns slug only (no anilistId)
 */
function parseAnilightId(id: string): { anilistId: number | null; slug: string | null } {
  if (id.startsWith("al:")) {
    const rest = id.slice(3);
    const colonIdx = rest.indexOf(":");
    if (colonIdx > 0) {
      const anilistId = Number(rest.slice(0, colonIdx));
      const slug = rest.slice(colonIdx + 1);
      return {
        anilistId: Number.isFinite(anilistId) && anilistId > 0 ? anilistId : null,
        slug: slug || null,
      };
    }
    const anilistId = Number(rest);
    if (Number.isFinite(anilistId) && anilistId > 0) {
      return { anilistId, slug: slugByAnilistId.get(anilistId) ?? null };
    }
  }
  // Treat as a bare slug
  if (id && id.length > 3) {
    return { anilistId: null, slug: id };
  }
  return { anilistId: null, slug: null };
}

/** Extract the {realid} from a megaplay embed URL like .../stream/s-2/{realid}/{sub|dub}. */
function parseRealidFromEmbedUrl(embedUrl: string): number | null {
  const m = embedUrl.match(/\/stream\/[^/]+\/(\d+)\//);
  if (m) return Number(m[1]);
  // Fall back: any trailing /sub|/dub preceded by a number
  const m2 = embedUrl.match(/\/(\d+)\/(?:sub|dub)$/);
  return m2 ? Number(m2[1]) : null;
}

function anilightToSearchResult(m: AnilightAnime): UnifiedSearchResult {
  // Cache the slug mapping for later lookups by anilistId
  if (m.anilistId && m.slug) slugByAnilistId.set(m.anilistId, m.slug);

  return {
    id: `al:${m.anilistId}:${m.slug}`,
    anilistId: m.anilistId,
    malId: m.idMal,
    title: {
      romaji: m.title?.romaji,
      english: m.title?.english,
      native: m.title?.native,
      preferred: m.title?.english || m.title?.romaji,
    },
    coverImage: {
      large: m.coverImage?.large || m.coverImage?.extraLarge,
      medium: m.coverImage?.medium,
      color: m.coverImage?.color ?? undefined,
    },
    banner: m.bannerImage,
    description: m.description,
    status: m.status,
    year: m.seasonYear,
    format: m.format,
    genres: m.genres,
    averageScore: m.averageScore,
    totalEpisodes: m.episodes ?? null,
    duration: m.duration,
    season: m.season,
  };
}

/** Build a /api/proxy/m3u8 URL that wraps an upstream URL with the megaplay referer. */
function buildProxiedM3u8(upstreamUrl: string): string {
  return `/api/proxy/m3u8?url=${encodeURIComponent(upstreamUrl)}&referer=${encodeURIComponent(MEGAPLAY_REFERER)}`;
}

/* ------------------------------------------------------------------ */
/*  Provider implementation                                            */
/* ------------------------------------------------------------------ */

export const anilightProvider: Provider = {
  meta: {
    id: "anilight",
    label: "Anilight",
    description: "AniList-native catalog · MegaPlay streams · Sub/Dub · Skip markers",
    accent: "from-amber-500 to-orange-500",
    supportsDub: true,
    defaultServer: "megaplay",
  },

  async search(query: string): Promise<UnifiedSearchResult[]> {
    if (!query.trim()) return [];
    const items = curlGetJSON<AnilightAnime[]>(`${ANILIGHT_API}/search?q=${encodeURIComponent(query)}`);
    if (!Array.isArray(items)) return [];
    return items.map(anilightToSearchResult);
  },

  async getInfo(id: string): Promise<UnifiedSearchResult | null> {
    const { slug } = parseAnilightId(id);
    if (!slug) return null;
    const m = curlGetJSON<AnilightAnime>(`${ANILIGHT_API}/anime/${encodeURIComponent(slug)}`);
    if (!m || !m.slug) return null;
    return anilightToSearchResult(m);
  },

  async getEpisodes(id: string): Promise<UnifiedEpisode[]> {
    const { slug } = parseAnilightId(id);
    if (!slug) return [];

    const cacheKey = `episodes:${slug}`;
    const cached = cacheGet<UnifiedEpisode[]>(cacheKey);
    if (cached) return cached;

    const doc = curlGetJSON<AnilightWatchResponse>(`${ANILIGHT_API}/watch/${encodeURIComponent(slug)}`);
    if (!doc || !Array.isArray(doc.episodes)) return [];

    const episodes: UnifiedEpisode[] = doc.episodes
      .filter((e) => e && typeof e.number === "number" && e.embed_url)
      .map((e) => {
        const hasDub = Boolean(e.embed_url.dub);
        const hasSub = Boolean(e.embed_url.sub);
        const variants: string[] = [];
        if (hasSub) variants.push("sub");
        if (hasDub) variants.push("dub");

        // sourceId encodes everything getSources needs:
        //   slug | epNum | subEmbed | dubEmbed
        // The embed URLs contain the realid, which is what megaplay's API needs.
        return {
          number: e.number,
          displayNumber: String(e.number),
          sourceId: `${slug}|${e.number}|${e.embed_url.sub || ""}|${e.embed_url.dub || ""}`,
          title: e.title,
          description: e.description,
          thumbnail: e.img,
          image: e.img,
          airedAt: e.airedAt,
          duration: e.duration,
          filler: e.isFiller,
          variants,
        } as UnifiedEpisode;
      })
      .sort((a, b) => a.number - b.number);

    return cacheSet(cacheKey, episodes);
  },

  async getServers(_id: string, _epNum: number): Promise<UnifiedServer[]> {
    // Anilight only uses megaplay.buzz — single server.
    return [
      {
        id: "megaplay",
        label: "MegaPlay",
        description: "Anilight's primary stream host (JW Player + multi-audio).",
        default: true,
      },
    ];
  },

  async getSources(opts): Promise<UnifiedSources> {
    const { id, epNum, server, sourceType = "sub" } = opts;

    // Find the episode by number — its sourceId encodes the embed URLs.
    const episodes = await this.getEpisodes(id);
    const ep = episodes.find((e) => e.number === epNum);
    if (!ep) {
      return {
        sources: [],
        subtitles: [],
        server: server || "auto",
        provider: "anilight",
      };
    }

    // sourceId format: "{slug}|{epNum}|{subEmbed}|{dubEmbed}"
    const [_slug, _epNumStr, subEmbed, dubEmbed] = ep.sourceId.split("|");

    // Pick the audio variant — prefer the requested one, fall back to whatever exists.
    const wantDub = sourceType === "dub";
    const embedUrl = (wantDub && dubEmbed) || subEmbed || dubEmbed;
    if (!embedUrl) {
      return {
        sources: [],
        subtitles: [],
        server: server || "megaplay",
        provider: "anilight",
      };
    }

    const realid = parseRealidFromEmbedUrl(embedUrl);
    if (!realid) {
      // Can't extract realid — fall back to the iframe URL directly.
      return {
        sources: [
          {
            url: embedUrl,
            type: "iframe",
            quality: "auto",
            originalUrl: embedUrl,
            upstreamReferer: "https://anilight.live/",
          },
        ],
        subtitles: [],
        server: server || "megaplay",
        provider: "anilight",
      };
    }

    // Fetch variants from megaplay to find the episode_id matching our audio type.
    const variants = await fetchMegaplayVariants(realid);
    let episodeId: number | null = null;
    let embedId: string | null = null;
    let variantType: string = wantDub ? "dub" : "sub";

    if (variants && variants.length > 0) {
      // Pick the matching variant; fall back to sub if dub requested but missing.
      const want = wantDub ? "dub" : "sub";
      let chosen = variants.find((v) => v.type === want);
      if (!chosen && wantDub) chosen = variants.find((v) => v.type === "sub");
      if (chosen) {
        episodeId = chosen.episode_id;
        embedId = chosen.embed_id;
        variantType = chosen.type;
      }
    }

    // Fallback: if megaplay's variant list is empty, derive episode_id from the
    // embed URL's data-id attribute. This isn't ideal but matches what their
    // page would do when /api/{realid} returns no data.
    if (!episodeId) {
      // The embed URL path is /stream/s-2/{realid}/{sub|dub} — we need the
      // episode_id which is different. Without /api/{realid}, we can't get
      // it. Return the iframe as fallback.
      return {
        sources: [
          {
            url: embedUrl,
            type: "iframe",
            quality: "auto",
            originalUrl: embedUrl,
            upstreamReferer: "https://anilight.live/",
          },
        ],
        subtitles: [],
        server: server || "megaplay",
        provider: "anilight",
      };
    }

    // Fetch the actual stream payload.
    const payload = await fetchMegaplaySources(episodeId);
    if (!payload || !payload.sources?.file) {
      // Stream payload missing — fall back to iframe.
      return {
        sources: [
          {
            url: embedUrl,
            type: "iframe",
            quality: "auto",
            originalUrl: embedUrl,
            upstreamReferer: "https://anilight.live/",
          },
        ],
        subtitles: [],
        server: server || "megaplay",
        provider: "anilight",
      };
    }

    const m3u8 = payload.sources.file;
    const proxied = buildProxiedM3u8(m3u8);

    const sources: UnifiedStreamSource[] = [
      {
        url: proxied,
        type: "master",
        quality: "auto",
        isMaster: true,
        originalUrl: m3u8,
        upstreamReferer: MEGAPLAY_REFERER,
      },
    ];

    // Always include the iframe as a fallback — if the m3u8 proxy gets
    // rate-limited or Cloudflare starts blocking us, the user's browser
    // can still play directly via megaplay's own player.
    sources.push({
      url: embedUrl,
      type: "iframe",
      quality: "auto",
      originalUrl: embedUrl,
      upstreamReferer: "https://anilight.live/",
    });

    // Subtitles — route through the proxy with the megaplay referer so
    // Cloudflare doesn't 403 them.
    const subtitles: UnifiedSubtitle[] = (payload.tracks || [])
      .filter((t) => t.file && (t.kind === "captions" || t.kind === "subtitles"))
      .map((t) => ({
        url: buildProxiedM3u8(t.file),
        lang: t.label || "Unknown",
      }));

    // Skip markers — megaplay returns intro/outro in seconds.
    const skips: UnifiedSkipMarkers | undefined =
      (payload.intro && (payload.intro.start > 0 || payload.intro.end > 0)) ||
      (payload.outro && (payload.outro.start > 0 || payload.outro.end > 0))
        ? {
            intro: payload.intro && (payload.intro.start > 0 || payload.intro.end > 0)
              ? payload.intro
              : undefined,
            outro: payload.outro && (payload.outro.start > 0 || payload.outro.end > 0)
              ? payload.outro
              : undefined,
          }
        : undefined;

    const rawPayload = {
      provider: "anilight",
      api: `${ANILIGHT_API}/watch/{slug} + ${MEGAPLAY_BASE}/api/{realid} + ${MEGAPLAY_BASE}/stream/getSourcesNew?id={episode_id}`,
      animeId: id,
      episodeNumber: epNum,
      server: "megaplay",
      variantType,
      realid,
      episodeId,
      embedId,
      embedUrl,
      m3u8,
      proxiedUrl: proxied,
      upstream: payload,
      normalized: {
        anilist_id: parseAnilightId(id).anilistId,
        episode: epNum,
        stream_type: variantType,
        provider: "megaplay",
        server_id: "megaplay",
        cdn_host: new URL(m3u8).host,
        hls_url: m3u8,
        mp4_url: null,
        embed_url: embedUrl,
        stream_format: "hls",
        quality: "auto",
        referer: MEGAPLAY_REFERER,
        is_default: true,
      },
    };

    return {
      sources,
      subtitles,
      skips,
      server: server || "megaplay",
      provider: "anilight",
      raw: rawPayload,
    };
  },
};
