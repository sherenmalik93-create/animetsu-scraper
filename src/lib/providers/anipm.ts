/**
 * Ani.pm provider — wraps https://ani.pm/
 *
 * Ani.pm is a React SPA backed by an Express-style REST API at
 * https://ani.pm/api/. Cloudflare fronts the whole origin, so every call
 * needs full browser headers (Sec-Ch-Ua, Sec-Fetch-*, Origin) or Cloudflare
 * returns a 403 managed-challenge page.
 *
 * API surface (all GET, all Cloudflare-fronted):
 *   GET /api/anime/search?q={query}                         → search results
 *   GET /api/anime/series/{id}                              → full anime doc
 *                                                            (incl. episodes[] with
 *                                                             embedId + megaplay sub/dub URLs)
 *   GET /api/anime/src/servers?title={slug}&ep={n}          → multi-provider server list
 *     Returns: { sub: [...], dub: [...] }
 *     Each entry: { provider, name, kind: "file"|"hls"|"embed", url, priority }
 *       - kind="file" → /api/anime/src/file?t={token}   serves a 251MB MP4 directly
 *       - kind="hls"  → /api/anime/src/hls?t={token}    serves a master m3u8 (relative URIs!)
 *       - kind="embed"→ iframe URL (e.g. https://vidnest.fun/anime/...)
 *     The `url` field for file/hls is a RELATIVE path like "/api/anime/src/hls?t=...".
 *     We resolve it to https://ani.pm/api/anime/src/hls?t=... and route through our proxy.
 *
 * Stream extraction strategy (matches user's instruction:
 * "if cloudflare blocks m3u just put the proxy means scrape proxy with m3u"):
 *
 *   For every provider returned by /api/anime/src/servers, we emit a
 *   UnifiedStreamSource. file → "mp4" type, hls → "master" type, embed →
 *   "iframe" type. file/hls URLs are wrapped with /api/proxy/m3u8 so the
 *   browser can play them CORS-safe — the proxy handles Referer injection,
 *   relative-URL rewriting, and Range requests.
 *
 *   In addition, the /api/anime/series doc contains megaplay.buzz embed URLs
 *   for every episode (sub + dub when available). We probe megaplay's API
 *   (same pipeline as the anilight provider) and emit those as additional
 *   "master" HLS sources — megaplay's m3u8 is on *.nekostream.site which is
 *   Cloudflare-fronted and needs Referer: https://megaplay.buzz/. Our proxy
 *   already knows that.
 *
 * ID format:
 *   We use `anipm:{seriesId}:{slug}` — encodes both the ani.pm numeric series
 *   id (for /api/anime/series/{id} and /api/anime/src/servers?title={slug})
 *   and the slug (for src/servers). When given a bare `anipm:{seriesId}` we
 *   fall back to a slug lookup via the series doc.
 */

import type {
  Provider,
  UnifiedSearchResult,
  UnifiedEpisode,
  UnifiedServer,
  UnifiedSources,
  UnifiedStreamSource,
  UnifiedSubtitle,
} from "./types";
import { execFileSync } from "node:child_process";

const ANIPM_BASE = "https://ani.pm";
const ANIPM_API = "https://ani.pm/api";
const ANIPM_ORIGIN = "https://ani.pm";
const MEGAPLAY_BASE = "https://megaplay.buzz";
const MEGAPLAY_REFERER = "https://megaplay.buzz/";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** In-process cache (5min TTL) — series docs are stable, don't refetch. */
const cache = new Map<string, { t: number; v: unknown }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

/** seriesId → slug map, populated by search() so bare anipm:{id} lookups work. */
const slugBySeriesId = new Map<number, string>();

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
/*  Cloudflare-friendly HTTP (curl with full browser headers)         */
/* ------------------------------------------------------------------ */

/**
 * Curl-backed GET for ani.pm's API. Cloudflare's managed challenge blocks
 * Node's undici (TLS fingerprinting) on some endpoints — series/{id} and
 * src/hls in particular. Curl with the full Sec-Ch-Ua / Sec-Fetch header
 * set sails through every endpoint we need. Pattern mirrors anilight.ts.
 */
function curlGetJSON<T>(url: string): T | null {
  const args = [
    "-sSL",
    "-A", BROWSER_UA,
    "-H", `Referer: ${ANIPM_ORIGIN}/`,
    "-H", `Origin: ${ANIPM_ORIGIN}`,
    "-H", "Accept: application/json,text/plain,*/*;q=0.8",
    "-H", "Accept-Language: en-US,en;q=0.9",
    "-H", 'Sec-Ch-Ua: "Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    "-H", "Sec-Ch-Ua-Mobile: ?0",
    "-H", 'Sec-Ch-Ua-Platform: "Windows"',
    "-H", "Sec-Fetch-Dest: empty",
    "-H", "Sec-Fetch-Mode: cors",
    "-H", "Sec-Fetch-Site: same-origin",
    "--http2",
    "--max-time", "20",
    "-w", "\n__HTTP_STATUS__%{http_code}",
    url,
  ];
  let out: string;
  try {
    out = execFileSync("curl", args, {
      encoding: "utf-8",
      maxBuffer: 20 * 1024 * 1024,
    });
  } catch {
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
/*  MegaPlay API (same pipeline as anilight.ts — Node fetch works)    */
/* ------------------------------------------------------------------ */

interface MegaplayVariant {
  episode_id: number;
  type: "sub" | "dub" | "hsub" | string;
  embed_id: string | null;
}

interface MegaplaySourcesResponse {
  sources: { file: string };
  tracks?: { file: string; label: string; kind: string }[];
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
}

async function fetchMegaplayVariants(realid: number): Promise<MegaplayVariant[] | null> {
  try {
    const res = await fetch(`${MEGAPLAY_BASE}/api/${realid}`, {
      headers: {
        "User-Agent": BROWSER_UA,
        Referer: `${MEGAPLAY_BASE}/stream/s-2/${realid}/sub`,
        "X-Requested-With": "XMLHttpRequest",
        Accept: "application/json, text/javascript, */*; q=0.01",
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { success: number; data: MegaplayVariant[] };
    return Array.isArray(json?.data) ? json.data : null;
  } catch {
    return null;
  }
}

async function fetchMegaplaySources(episodeId: number): Promise<MegaplaySourcesResponse | null> {
  try {
    const res = await fetch(`${MEGAPLAY_BASE}/stream/getSourcesNew?id=${episodeId}`, {
      headers: {
        "User-Agent": BROWSER_UA,
        Referer: "https://ani.pm/",
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
/*  Ani.pm API types                                                  */
/* ------------------------------------------------------------------ */

interface AnipmSearchItem {
  id: number;
  slug?: string | null;
  source?: string | null;
  title: string;
  native?: string | null;
  poster?: string | null;
  banner?: string | null;
  year?: number | null;
  score?: number | null;
  rating?: string | null;
  duration?: string | null;
  status?: string | null;
  type?: string | null;
  genres?: string[];
  studios?: string[];
  episodeCount?: number | null;
  subCount?: number | null;
  dubCount?: number | null;
  synopsis?: string;
  malId?: string | null;
  anilistId?: string | null;
  season?: string | null;
}

interface AnipmEpisode {
  number: number;
  title?: string;
  thumbnail?: string;
  description?: string;
  embedId?: string;
  sub?: string;
  dub?: string;
}

interface AnipmSeries extends AnipmSearchItem {
  episodes?: AnipmEpisode[];
  hasDub?: boolean;
  trailer?: { youtubeId?: string; thumbnail?: string };
}

interface AnipmServerEntry {
  provider: string;
  name: string;
  /** "file" = MP4, "hls" = m3u8, "embed" = iframe */
  kind: "file" | "hls" | "embed";
  url: string;
  priority?: number;
  subtitle?: string;
}

interface AnipmServersResponse {
  sub?: AnipmServerEntry[];
  dub?: AnipmServerEntry[];
}

interface AnipmSearchResponse {
  items: AnipmSearchItem[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/**
 * Parse the anipm id. Accepted formats:
 *   - "anipm:{seriesId}:{slug}"  → returns both
 *   - "anipm:{seriesId}"         → returns seriesId, slug from cache
 *   - "{seriesId}"               → returns seriesId only (treated as bare id)
 */
function parseAnipmId(id: string): { seriesId: number | null; slug: string | null } {
  if (id.startsWith("anipm:")) {
    const rest = id.slice(6);
    const colonIdx = rest.indexOf(":");
    if (colonIdx > 0) {
      const seriesId = Number(rest.slice(0, colonIdx));
      const slug = rest.slice(colonIdx + 1);
      return {
        seriesId: Number.isFinite(seriesId) && seriesId > 0 ? seriesId : null,
        slug: slug || null,
      };
    }
    const seriesId = Number(rest);
    if (Number.isFinite(seriesId) && seriesId > 0) {
      return { seriesId, slug: slugBySeriesId.get(seriesId) ?? null };
    }
  }
  // Bare numeric id
  const n = Number(id);
  if (Number.isFinite(n) && n > 0) {
    return { seriesId: n, slug: slugBySeriesId.get(n) ?? null };
  }
  return { seriesId: null, slug: null };
}

/** Extract the {realid} from a megaplay embed URL like .../stream/s-2/{realid}/{sub|dub}. */
function parseRealidFromEmbedUrl(embedUrl: string): number | null {
  const m = embedUrl.match(/\/stream\/[^/]+\/(\d+)\//);
  if (m) return Number(m[1]);
  const m2 = embedUrl.match(/\/(\d+)\/(?:sub|dub)$/);
  return m2 ? Number(m2[1]) : null;
}

function anipmToSearchResult(m: AnipmSearchItem): UnifiedSearchResult {
  if (m.id && m.slug) slugBySeriesId.set(m.id, m.slug);
  const anilistId = m.anilistId ? Number(m.anilistId) : undefined;
  const malId = m.malId ? Number(m.malId) : undefined;
  return {
    id: `anipm:${m.id}:${m.slug ?? ""}`,
    anilistId: Number.isFinite(anilistId) ? anilistId : undefined,
    malId: Number.isFinite(malId) ? malId : undefined,
    title: {
      romaji: m.native || undefined,
      english: m.title,
      native: m.native || undefined,
      preferred: m.title,
    },
    coverImage: {
      large: m.poster || undefined,
    },
    banner: m.banner || undefined,
    description: m.synopsis,
    status: m.status || undefined,
    year: m.year || undefined,
    format: m.type || undefined,
    genres: m.genres,
    averageScore: m.score || undefined,
    totalEpisodes: m.episodeCount ?? null,
    duration: m.duration ? Number(m.duration.replace(/[^\d]/g, "")) || undefined : undefined,
    season: m.season || undefined,
  };
}

/** Wrap an upstream URL with our /api/proxy/m3u8 streaming proxy. */
function buildProxiedUrl(upstreamUrl: string, referer?: string): string {
  const u = `/api/proxy/m3u8?url=${encodeURIComponent(upstreamUrl)}`;
  return referer ? `${u}&referer=${encodeURIComponent(referer)}` : u;
}

/** Resolve a relative ani.pm URL (e.g. /api/anime/src/hls?t=...) to absolute. */
function resolveAnipmUrl(maybeRelative: string): string {
  if (/^https?:\/\//i.test(maybeRelative)) return maybeRelative;
  if (maybeRelative.startsWith("/")) return `${ANIPM_BASE}${maybeRelative}`;
  return `${ANIPM_BASE}/${maybeRelative}`;
}

/* ------------------------------------------------------------------ */
/*  Provider implementation                                           */
/* ------------------------------------------------------------------ */

export const anipmProvider: Provider = {
  meta: {
    id: "anipm",
    label: "Ani.pm",
    description: "Ani.pm — Vega MP4 + Onyx HLS + MegaPlay · sub & dub · all servers",
    accent: "from-indigo-500 to-violet-500",
    supportsDub: true,
    defaultServer: "onyx-hls",
  },

  async search(query: string): Promise<UnifiedSearchResult[]> {
    if (!query.trim()) return [];
    const q = encodeURIComponent(query);
    const res = curlGetJSON<AnipmSearchResponse | AnipmSearchItem[]>(
      `${ANIPM_API}/anime/search?q=${q}`
    );
    if (!res) return [];
    // The endpoint returns {items:[...]} but be defensive and accept a bare array too.
    const items = Array.isArray(res) ? res : res.items;
    if (!Array.isArray(items)) return [];
    return items.map(anipmToSearchResult);
  },

  async getInfo(id: string): Promise<UnifiedSearchResult | null> {
    const { seriesId } = parseAnipmId(id);
    if (!seriesId) return null;
    const doc = curlGetJSON<AnipmSeries>(`${ANIPM_API}/anime/series/${seriesId}`);
    if (!doc || !doc.id) return null;
    return anipmToSearchResult(doc);
  },

  async getEpisodes(id: string): Promise<UnifiedEpisode[]> {
    const { seriesId } = parseAnipmId(id);
    if (!seriesId) return [];

    const cacheKey = `episodes:${seriesId}`;
    const cached = cacheGet<UnifiedEpisode[]>(cacheKey);
    if (cached) return cached;

    const doc = curlGetJSON<AnipmSeries>(`${ANIPM_API}/anime/series/${seriesId}`);
    if (!doc || !Array.isArray(doc.episodes)) return [];

    // Cache the slug mapping for later lookups
    if (doc.id && doc.slug) slugBySeriesId.set(doc.id, doc.slug);

    const episodes: UnifiedEpisode[] = doc.episodes
      .filter((e) => typeof e.number === "number")
      .map((e) => {
        const hasSub = Boolean(e.sub);
        const hasDub = Boolean(e.dub);
        const variants: string[] = [];
        if (hasSub) variants.push("sub");
        if (hasDub) variants.push("dub");
        return {
          number: e.number,
          displayNumber: String(e.number),
          // sourceId encodes everything getSources needs:
          //   seriesId | epNum | subEmbed | dubEmbed
          sourceId: `${seriesId}|${e.number}|${e.sub || ""}|${e.dub || ""}`,
          title: e.title,
          description: e.description,
          thumbnail: e.thumbnail,
          image: e.thumbnail,
          variants,
        } as UnifiedEpisode;
      })
      .sort((a, b) => a.number - b.number);

    return cacheSet(cacheKey, episodes);
  },

  async getServers(id: string, epNum: number): Promise<UnifiedServer[]> {
    // Hit /api/anime/src/servers to enumerate providers, plus we always
    // include "megaplay" as a synthetic server because the series doc
    // carries megaplay embed URLs for every episode.
    const { seriesId, slug } = parseAnipmId(id);
    if (!seriesId || !slug) {
      // Without slug we can't call src/servers — fall back to megaplay only.
      return [
        { id: "megaplay", label: "MegaPlay", description: "Ani.pm's megaplay.buzz embed", default: true },
      ];
    }

    const serversRes = curlGetJSON<AnipmServersResponse>(
      `${ANIPM_API}/anime/src/servers?title=${encodeURIComponent(slug)}&ep=${epNum}`
    );

    const servers: UnifiedServer[] = [];
    const seen = new Set<string>();

    if (serversRes) {
      // Dedup by provider+kind so we don't list "Vega · 1" and "Vega · 2" separately.
      const addEntry = (e: AnipmServerEntry, type: "sub" | "dub") => {
        const key = `${e.provider}:${e.kind}:${type}`;
        if (seen.has(key)) return;
        seen.add(key);
        const id2 = `${e.provider}-${e.kind}-${type}`.toLowerCase();
        servers.push({
          id: id2,
          label: `${e.provider} ${type.toUpperCase()} (${e.kind})`,
          description: `${e.provider} · ${e.kind} · ${type}`,
          default: servers.length === 0,
        });
      };
      (serversRes.sub || []).forEach((e) => addEntry(e, "sub"));
      (serversRes.dub || []).forEach((e) => addEntry(e, "dub"));
    }

    // Always include megaplay as a server option (its URL comes from the series doc).
    servers.push({
      id: "megaplay",
      label: "MegaPlay",
      description: "megaplay.buzz HLS — same pipeline as the anilight provider",
      default: servers.length === 0,
    });

    return servers;
  },

  async getSources(opts): Promise<UnifiedSources> {
    const { id, epNum, server, sourceType = "sub" } = opts;

    // Find the episode by number — its sourceId encodes the megaplay embed URLs.
    const episodes = await this.getEpisodes(id);
    const ep = episodes.find((e) => e.number === epNum);
    if (!ep) {
      return {
        sources: [],
        subtitles: [],
        server: server || "auto",
        provider: "anipm",
      };
    }

    const { seriesId, slug } = parseAnipmId(id);

    // -------------------------------------------------------------------
    // 1. /api/anime/src/servers — Vega (file/MP4) + Onyx (HLS) + embeds
    // -------------------------------------------------------------------
    const wantDub = sourceType === "dub";
    let serversRes: AnipmServersResponse | null = null;
    if (slug) {
      serversRes = curlGetJSON<AnipmServersResponse>(
        `${ANIPM_API}/anime/src/servers?title=${encodeURIComponent(slug)}&ep=${epNum}`
      );
    }

    const sources: UnifiedStreamSource[] = [];
    const subtitles: UnifiedSubtitle[] = [];

    if (serversRes) {
      const list = wantDub
        ? [...(serversRes.dub || []), ...(serversRes.sub || [])]
        : [...(serversRes.sub || []), ...(serversRes.dub || [])];

      for (const entry of list) {
        if (!entry.url) continue;
        const isHls = entry.kind === "hls";
        const isFile = entry.kind === "file";
        const isEmbed = entry.kind === "embed";

        if (isHls || isFile) {
          const upstream = resolveAnipmUrl(entry.url);
          sources.push({
            url: buildProxiedUrl(upstream, `${ANIPM_ORIGIN}/`),
            type: isHls ? "master" : "mp4",
            quality: isHls ? "auto" : "1080p",
            isMaster: isHls,
            originalUrl: upstream,
            upstreamReferer: `${ANIPM_ORIGIN}/`,
          });
        } else if (isEmbed) {
          sources.push({
            url: entry.url,
            type: "iframe",
            quality: "auto",
            originalUrl: entry.url,
            upstreamReferer: `${ANIPM_ORIGIN}/`,
          });
        }
      }
    }

    // -------------------------------------------------------------------
    // 2. MegaPlay HLS — same pipeline as the anilight provider.
    //    The series doc gave us sub/dub embed URLs for every episode.
    // -------------------------------------------------------------------
    const [_sid, _ep, subEmbedRaw, dubEmbedRaw] = ep.sourceId.split("|");
    const subEmbed = subEmbedRaw || "";
    const dubEmbed = dubEmbedRaw || "";
    const megaplayEmbed = (wantDub && dubEmbed) || subEmbed || dubEmbed;

    let megaplayM3u8: string | null = null;
    let megaplaySubtitles: UnifiedSubtitle[] = [];
    let megaplayIntro: { start: number; end: number } | undefined;
    let megaplayOutro: { start: number; end: number } | undefined;
    let megaplayVariantType = wantDub ? "dub" : "sub";

    if (megaplayEmbed) {
      const realid = parseRealidFromEmbedUrl(megaplayEmbed);
      if (realid) {
        const variants = await fetchMegaplayVariants(realid);
        if (variants && variants.length > 0) {
          const want = wantDub ? "dub" : "sub";
          let chosen = variants.find((v) => v.type === want);
          if (!chosen && wantDub) chosen = variants.find((v) => v.type === "sub");
          if (chosen) {
            megaplayVariantType = chosen.type;
            const payload = await fetchMegaplaySources(chosen.episode_id);
            if (payload?.sources?.file) {
              megaplayM3u8 = payload.sources.file;
              megaplaySubtitles = (payload.tracks || [])
                .filter((t) => t.file && (t.kind === "captions" || t.kind === "subtitles"))
                .map((t) => ({
                  url: buildProxiedUrl(t.file, MEGAPLAY_REFERER),
                  lang: t.label || "Unknown",
                }));
              if (payload.intro && (payload.intro.start > 0 || payload.intro.end > 0)) {
                megaplayIntro = payload.intro;
              }
              if (payload.outro && (payload.outro.start > 0 || payload.outro.end > 0)) {
                megaplayOutro = payload.outro;
              }
            }
          }
        }
      }

      // Always include the megaplay iframe as a fallback — even if m3u8
      // extraction failed, the user's browser can play directly via
      // megaplay's own player (Cloudflare Turnstile solves natively there).
      sources.push({
        url: megaplayEmbed,
        type: "iframe",
        quality: "auto",
        originalUrl: megaplayEmbed,
        upstreamReferer: `${ANIPM_ORIGIN}/`,
      });
    }

    // If megaplay HLS extraction succeeded, add it as a master source.
    if (megaplayM3u8) {
      sources.unshift({
        url: buildProxiedUrl(megaplayM3u8, MEGAPLAY_REFERER),
        type: "master",
        quality: "auto",
        isMaster: true,
        originalUrl: megaplayM3u8,
        upstreamReferer: MEGAPLAY_REFERER,
      });
      subtitles.push(...megaplaySubtitles);
    }

    // -------------------------------------------------------------------
    // Build the raw payload for the "Show raw response" panel.
    // -------------------------------------------------------------------
    const rawPayload = {
      provider: "anipm",
      api: `${ANIPM_API}/anime/series/{id} + ${ANIPM_API}/anime/src/servers?title={slug}&ep={n} + ${MEGAPLAY_BASE}/api/{realid} + ${MEGAPLAY_BASE}/stream/getSourcesNew?id={episode_id}`,
      animeId: id,
      episodeNumber: epNum,
      server: server || "auto",
      sourceType,
      seriesId,
      slug,
      serversRes,
      megaplay: {
        embedUrl: megaplayEmbed,
        variantType: megaplayVariantType,
        m3u8: megaplayM3u8,
        subtitles: megaplaySubtitles,
        intro: megaplayIntro,
        outro: megaplayOutro,
      },
      normalized: {
        anilist_id: parseAnipmId(id).seriesId,
        episode: epNum,
        stream_type: megaplayVariantType,
        providers_scraped: [
          ...(serversRes?.sub || []).map((e) => `${e.provider}/${e.kind}/sub`),
          ...(serversRes?.dub || []).map((e) => `${e.provider}/${e.kind}/dub`),
          ...(megaplayM3u8 ? ["megaplay/hls"] : []),
        ],
        cdn_hosts: Array.from(
          new Set(
            sources
              .map((s) => {
                try {
                  return new URL(s.originalUrl || s.url).host;
                } catch {
                  return null;
                }
              })
              .filter(Boolean) as string[]
          )
        ),
        is_default: true,
      },
    };

    return {
      sources,
      subtitles,
      skips:
        megaplayIntro || megaplayOutro
          ? { intro: megaplayIntro, outro: megaplayOutro }
          : undefined,
      server: server || "auto",
      provider: "anipm",
      raw: rawPayload,
    };
  },
};
