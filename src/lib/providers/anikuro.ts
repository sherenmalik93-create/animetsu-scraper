/**
 * Anikuro provider
 *
 * Anikuro.ru exposes a clean JSON API at `/api/v1/*` that aggregates 11
 * upstream anime providers (animepahe, anikoto, reanime, animedao, animegg,
 * anidb, animedunya, animeverse, allani, senshi, animix). Streams come back
 * pre-wrapped through `https://proxy.anikuro.ru/<base64>.m3u8|referer`.
 *
 * The anikuro m3u8 proxy itself returns HTTP 500 (broken as of 2026-06),
 * but the MP4 proxy works perfectly, and the original m3u8 URLs returned in
 * `originalUrl` can be routed through our own /api/proxy/m3u8 with the
 * upstreamReferer header set.
 *
 * Strategy per episode:
 *   1. Fire requests to all 11 providers in parallel
 *   2. Pick whichever provider returned a playable source
 *      (prefer MP4 > HLS, prefer working over broken)
 *   3. Wrap the URL through our own proxy, passing the upstream referer
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

const ANIKURO_BASE = process.env.ANIKURO_BASE || "https://anikuro.ru";
const ANIKURO_PROXY = process.env.ANIKURO_PROXY || "https://proxy.anikuro.ru";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * All 11 providers anikuro supports, in order of preference.
 *
 * As of 2026-06, the anikuro m3u8 proxy (proxy.anikuro.ru) returns HTTP 500,
 * and the upstream HLS CDNs (cdn.mewstream.buzz, hlsx3cdn.burntburst45.store)
 * are Cloudflare-protected so we can't fetch them directly either.
 *
 * The MP4 providers work through anikuro's proxy with Range support, so we
 * prefer those first. The HLS providers are kept as fallback for cases where
 * no MP4 source is available — they'll fail gracefully.
 */
const ALL_PROVIDERS = [
  "animeverse", // MP4 — works through anikuro proxy
  "animepahe",  // Sometimes has MP4
  "anikoto",    // HLS (often broken)
  "animix",     // HLS (often broken)
  "reanime",
  "animedao",
  "animegg",
  "allani",
  "senshi",
  "anidb",
  "animedunya",
] as const;

export const anikuroProvider: Provider = {
  meta: {
    id: "anikuro",
    label: "Anikuro",
    description: "11 upstream providers · Sub/Dub · AniList IDs native",
    accent: "from-violet-500 to-fuchsia-500",
    supportsDub: true,
    defaultServer: "animeverse",
  },

  async search(query: string): Promise<UnifiedSearchResult[]> {
    if (!query.trim()) return [];
    const url = `${ANIKURO_BASE}/api/v1/discovery/search?query=${encodeURIComponent(query)}`;
    const payload = await fetchJson<AnikuroSearchPayload>(url);
    const items = payload?.data?.items || [];
    return items.map((m) => ({
      id: String(m.id),
      anilistId: m.anilistId,
      malId: m.malId,
      title: {
        romaji: m.title?.romaji,
        english: m.title?.english,
        native: m.title?.native,
        preferred: m.title?.userPreferred,
      },
      coverImage: {
        large: m.images?.cover || m.banner,
        banner: m.images?.banner || m.banner,
      },
      banner: m.images?.banner || m.banner,
      description: m.description,
      status: m.status,
      year: m.seasonYear,
      format: m.format,
      genres: m.genres,
      averageScore: m.averageScore,
      totalEpisodes: m.episodes,
      duration: m.duration,
      season: m.season,
      isAdult: m.isAdult,
    }));
  },

  async getInfo(id: string): Promise<UnifiedSearchResult | null> {
    // Direct lookup via /api/v1/anime/<id> — returns the full anime document.
    const url = `${ANIKURO_BASE}/api/v1/anime/${encodeURIComponent(id)}`;
    const payload = await fetchJson<AnikuroAnimePayload>(url);
    const m = payload?.data;
    if (!m) return null;
    return {
      id: String(m.id),
      anilistId: m.anilistId,
      malId: m.malId,
      title: {
        romaji: m.title?.romaji,
        english: m.title?.english,
        native: m.title?.native,
        preferred: m.title?.userPreferred,
      },
      coverImage: {
        large: m.images?.cover,
        banner: m.images?.banner,
        color: m.images?.color,
      },
      banner: m.images?.banner,
      description: m.description,
      status: m.status,
      year: m.seasonYear,
      format: m.format,
      genres: m.genres,
      averageScore: m.averageScore,
      totalEpisodes: m.episodeCount,
      duration: m.duration,
      season: m.season,
    };
  },

  async getEpisodes(id: string): Promise<UnifiedEpisode[]> {
    const url = `${ANIKURO_BASE}/api/v1/anime/${encodeURIComponent(id)}/episodes`;
    const payload = await fetchJson<AnikuroEpisodesPayload>(url);
    const list = payload?.data?.episodes || [];
    return list.map((e) => ({
      number: e.number,
      displayNumber: e.displayNumber || String(e.number),
      // Anikuro uses `${animeId}:${epNum}` as the sourceId
      sourceId: e.id || `${id}:${e.number}`,
      title: e.title,
      description: e.overview || e.description,
      thumbnail: e.thumbnail || e.image,
      image: e.image,
      airedAt: e.airDateUtc || e.airDate,
      duration: e.duration,
      filler: e.filler,
      variants: e.variants || ["sub"],
    }));
  },

  async getServers(_id: string, _epNum: number): Promise<UnifiedServer[]> {
    // Anikuro doesn't have a separate servers endpoint — each "provider"
    // IS a server from the UI's perspective.
    return ALL_PROVIDERS.map((p, i) => ({
      id: p,
      label: p,
      description: p === "animeverse" ? "MP4 — fast" : p === "anikoto" ? "HLS — multi quality" : "Auto fallback",
      default: i === 0,
    }));
  },

  async getSources(opts): Promise<UnifiedSources> {
    const { id, epNum, server, sourceType = "sub" } = opts;
    const episodeId = `${id}:${epNum}`;

    // If the user picked a specific server, try just that one.
    // Otherwise fan out to a curated subset of providers (the ones most likely
    // to return playable MP4 sources) in parallel. Hitting all 11 takes 15+ s.
    const providersToTry = server && server !== "auto" && server !== "default"
      ? [server]
      : ["animeverse", "animegg", "anikoto", "animepahe"];

    const attempts = await Promise.all(
      providersToTry.map(async (p) => {
        try {
          const url = `${ANIKURO_BASE}/api/v1/sources/${encodeURIComponent(p)}/${encodeURIComponent(episodeId)}`;
          const payload = await fetchJson<AnikuroSourcesPayload>(url);
          return { provider: p, payload: payload?.data };
        } catch {
          return { provider: p, payload: undefined };
        }
      })
    );

    // If nothing came back from the fast set, fall back to the remaining providers.
    const haveHit = attempts.some((a) => {
      const raw = a.payload?.raw || {};
      const v = raw[subDubKey(sourceType)] || raw[subDubKey(sourceType === "dub" ? "sub" : "dub")];
      return v && Array.isArray(v.sources) && v.sources.length > 0;
    });

    if (!haveHit) {
      const fallbackProviders = ALL_PROVIDERS.filter((p) => !providersToTry.includes(p));
      const fallbackAttempts = await Promise.all(
        fallbackProviders.map(async (p) => {
          try {
            const url = `${ANIKURO_BASE}/api/v1/sources/${encodeURIComponent(p)}/${encodeURIComponent(episodeId)}`;
            const payload = await fetchJson<AnikuroSourcesPayload>(url);
            return { provider: p, payload: payload?.data };
          } catch {
            return { provider: p, payload: undefined };
          }
        })
      );
      attempts.push(...fallbackAttempts);
    }

    // Find the first attempt that has a usable source for the requested variant.
    // Fall back to whichever variant is available if the requested one isn't.
    // Prefer MP4 sources (they work reliably) over HLS (often CF-blocked).
    const wantedKey = sourceType === "dub" ? "dub" : "sub";
    const fallbackKey = sourceType === "dub" ? "sub" : "dub";

    const candidates: { provider: string; sources: AnikuroSourceEntry[]; subtitles: AnikuroSubtitle[]; isMp4: boolean }[] = [];
    for (const attempt of attempts) {
      const data = attempt.payload;
      if (!data) continue;
      const raw = data.raw || {};
      const variant = raw[wantedKey] || raw[fallbackKey];
      if (variant && Array.isArray(variant.sources) && variant.sources.length > 0) {
        const isMp4 = variant.sources.some((s) => s.type === "mp4" || !s.isM3U8);
        candidates.push({
          provider: attempt.provider,
          sources: variant.sources,
          subtitles: variant.subtitles || [],
          isMp4,
        });
      }
    }

    // Sort: MP4 sources first, then anything else
    candidates.sort((a, b) => (a.isMp4 === b.isMp4 ? 0 : a.isMp4 ? -1 : 1));
    const chosen = candidates[0] || null;

    if (!chosen) {
      return {
        sources: [],
        subtitles: [],
        server: server || "auto",
        provider: "anikuro",
      };
    }

    const unified: UnifiedStreamSource[] = [];
    const subtitles: UnifiedSubtitle[] = [];

    for (const s of chosen.sources) {
      const isMp4 = s.type === "mp4" || !s.isM3U8;
      let playableUrl: string;
      if (isMp4) {
        // MP4: use anikuro's proxy directly (it works and supports Range)
        playableUrl = s.url;
      } else {
        // HLS: route through our own proxy with the right referer.
        // Note: many upstream HLS CDNs are CF-protected and may still 403.
        const decoded = decodeAnikuroProxyUrl(s.url);
        const upstream = s.originalUrl || decoded.url;
        const referer = s.upstreamReferer || decoded.referer || "https://anikuro.ru/";
        playableUrl = `/api/proxy/m3u8?url=${encodeURIComponent(upstream)}&referer=${encodeURIComponent(referer)}`;
      }

      unified.push({
        url: playableUrl,
        type: isMp4 ? "mp4" : "hls",
        quality: s.quality || (isMp4 ? "default" : "auto"),
        isMaster: !isMp4,
        originalUrl: s.originalUrl,
        upstreamReferer: s.upstreamReferer,
      });
    }

    for (const sub of chosen.subtitles) {
      subtitles.push({
        url: sub.url,
        lang: sub.lang || sub.language || "Unknown",
      });
    }

    return {
      sources: unified,
      subtitles,
      server: chosen.provider,
      provider: "anikuro",
    };
  },
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        Referer: "https://anikuro.ru/",
        Accept: "application/json",
      },
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** Tiny helper so we don't repeat the sub/dub key logic. */
function subDubKey(t: "sub" | "dub"): "sub" | "dub" {
  return t;
}

/**
 * Decode an anikuro proxy URL of the form:
 *   https://proxy.anikuro.ru/<base64>.m3u8?proxy=0
 * where the base64 decodes to: <streamUrl>|<referer>
 */
export function decodeAnikuroProxyUrl(proxyUrl: string): { url: string; referer: string } {
  try {
    const u = new URL(proxyUrl);
    const path = u.pathname.slice(1); // strip leading /
    const b64 = path.replace(/\.(m3u8|mp4|mkv)$/i, "");
    const decoded = Buffer.from(b64, "base64").toString("utf-8");
    const [url, referer] = decoded.split("|");
    return { url: url || "", referer: referer || "" };
  } catch {
    return { url: proxyUrl, referer: "" };
  }
}

/* ------------------------------------------------------------------ */
/*  Upstream type shapes (only what we read)                          */
/* ------------------------------------------------------------------ */

interface AnikuroSearchPayload {
  ok?: boolean;
  data?: {
    items: Array<{
      id: number;
      anilistId?: number;
      malId?: number;
      banner?: string;
      title?: {
        native?: string;
        romaji?: string;
        english?: string;
        userPreferred?: string;
      };
      description?: string;
      episodes?: number;
      status?: string;
      startDate?: { day?: number; month?: number; year?: number };
      endDate?: { day?: number; month?: number; year?: number };
      season?: string;
      seasonYear?: number;
      format?: string;
      countryOfOrigin?: string;
      genres?: string[];
      duration?: number;
      averageScore?: number;
      meanScore?: number;
      popularity?: number;
      trending?: number;
      isAdult?: boolean;
      images?: { cover?: string; banner?: string };
    }>;
  };
}

interface AnikuroAnimePayload {
  ok?: boolean;
  data?: {
    id: number;
    anilistId?: number;
    malId?: number;
    title?: {
      native?: string;
      romaji?: string;
      english?: string;
      userPreferred?: string;
    };
    format?: string;
    status?: string;
    type?: string;
    images?: { cover?: string; banner?: string; thumbnail?: string; color?: string };
    genres?: string[];
    averageScore?: number;
    meanScore?: number;
    popularity?: number;
    trending?: number;
    episodeCount?: number;
    duration?: number;
    description?: string;
    season?: string;
    seasonYear?: number;
    startDate?: { day?: number; month?: number; year?: number };
    endDate?: { day?: number; month?: number; year?: number };
    countryOfOrigin?: string;
    isAdult?: boolean;
  };
}

interface AnikuroEpisodesPayload {
  ok?: boolean;
  data?: {
    animeId: number;
    episodes: Array<{
      id: string;
      animeId: number;
      number: number;
      displayNumber?: string;
      title?: string;
      image?: string;
      thumbnail?: string;
      description?: string;
      overview?: string;
      airedAt?: string;
      airDate?: string;
      airDateUtc?: string;
      duration?: number;
      filler?: boolean;
      variants?: string[];
    }>;
  };
}

interface AnikuroSourcesPayload {
  ok?: boolean;
  data?: {
    provider: string;
    animeId: number;
    episode: number;
    episodeId: string;
    raw?: {
      sub?: AnikuroVariant | null;
      dub?: AnikuroVariant | null;
      error?: string;
    };
  };
}

interface AnikuroVariant {
  default?: string;
  sources: AnikuroSourceEntry[];
  subtitles?: AnikuroSubtitle[];
  headers?: Record<string, string>;
}

interface AnikuroSourceEntry {
  url: string;
  originalUrl?: string;
  upstreamReferer?: string;
  quality?: string;
  type?: string; // "hls" | "mp4"
  isM3U8?: boolean;
  headers?: Record<string, string>;
}

interface AnikuroSubtitle {
  url: string;
  lang?: string;
  language?: string;
}
